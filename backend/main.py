from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "supply_chain_tracking"
    frontend_origins: str = "http://localhost:5500,http://127.0.0.1:5500"

    class Config:
        env_file = ".env"


settings = Settings()


class Lote(BaseModel):
    codigo: str
    produto_base: str
    fabricante: str
    origem: str
    destino_previsto: str
    quantidade_prevista: int
    quantidade_confirmada: int
    status: str
    nota_fiscal: str
    indicadores_risco: dict[str, Any]


class Produto(BaseModel):
    codigo: str
    nome: str
    categoria: str
    lote: str
    fabricante: str
    status_atual: str
    localizacao_atual: dict[str, Any]
    ultima_movimentacao: str
    ultimas_movimentacoes: list[dict[str, Any]] = Field(default_factory=list)
    alertas_ativos: list[dict[str, Any]] = Field(default_factory=list)


class Movimentacao(BaseModel):
    produto: str
    lote: str
    tipo: str
    status_resultante: str
    data_hora: str
    origem: str
    destino: str
    usuario: str
    nota_fiscal: str
    quantidade_informada: int
    quantidade_confirmada: int
    verificacao: dict[str, Any]


class Alerta(BaseModel):
    tipo: str
    descricao: str
    gravidade: str
    status: str
    produto: str
    lote: str
    movimentacao: str
    data_emissao: str
    responsavel_auditoria: str


class Local(BaseModel):
    nome: str
    tipo: str
    cidade: str
    estado: str
    pais: str
    coordenadas: dict[str, float]


class NotaFiscal(BaseModel):
    numero: str
    emissor: str
    destinatario: str
    data_emissao: str
    quantidade_declarada: int
    valor_total: float
    status_validacao: str


def clean_document(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if not document:
        return None
    document.pop("_id", None)
    return document


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = AsyncIOMotorClient(settings.mongodb_uri)
    app.state.mongo_client = client
    app.state.db = client[settings.mongodb_db]
    yield
    client.close()


app = FastAPI(
    title="API de Rastreamento de Cadeia de Suprimentos",
    version="1.0.0",
    lifespan=lifespan,
)

origins = [origin.strip() for origin in settings.frontend_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "online", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/stats")
async def stats():
    db = app.state.db
    produtos = await db.produtos.count_documents({})
    lotes = await db.lotes.count_documents({})
    alertas_abertos = await db.alertas.count_documents({"status": {"$ne": "resolvido"}})
    movimentacoes = await db.movimentacoes.count_documents({})
    fraudes_bloqueadas = await db.alertas.count_documents({"gravidade": "alta", "status": "resolvido"})
    autenticados = await db.produtos.count_documents({"status_atual": {"$in": ["entregue", "autenticado"]}})
    return {
        "produtos_rastreados": produtos,
        "produtos_autenticados": autenticados,
        "lotes_ativos": lotes,
        "alertas_abertos": alertas_abertos,
        "alertas_analisados": await db.alertas.count_documents({}),
        "movimentacoes_hoje": movimentacoes,
        "tentativas_fraude_bloqueadas": fraudes_bloqueadas,
    }


@app.get("/api/produtos")
async def listar_produtos(q: str | None = None):
    filtro: dict[str, Any] = {}
    if q:
        filtro = {
            "$or": [
                {"codigo": {"$regex": q, "$options": "i"}},
                {"nome": {"$regex": q, "$options": "i"}},
                {"lote": {"$regex": q, "$options": "i"}},
            ]
        }
    cursor = app.state.db.produtos.find(filtro).sort("nome", 1)
    return [clean_document(doc) async for doc in cursor]


@app.get("/api/produtos/{codigo}")
async def obter_produto(codigo: str):
    produto = clean_document(await app.state.db.produtos.find_one({"codigo": codigo}))
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    movimentacoes = [
        clean_document(doc)
        async for doc in app.state.db.movimentacoes.find({"produto": codigo}).sort("data_hora", 1)
    ]
    alertas = [
        clean_document(doc)
        async for doc in app.state.db.alertas.find({"produto": codigo}).sort("data_emissao", -1)
    ]
    produto["movimentacoes"] = movimentacoes
    produto["alertas"] = alertas
    return produto


@app.post("/api/produtos", status_code=201)
async def criar_produto(produto: Produto):
    await app.state.db.produtos.update_one(
        {"codigo": produto.codigo},
        {"$set": produto.model_dump()},
        upsert=True,
    )
    return {"message": "Produto salvo", "codigo": produto.codigo}


@app.get("/api/lotes")
async def listar_lotes():
    return [clean_document(doc) async for doc in app.state.db.lotes.find({}).sort("codigo", 1)]


@app.post("/api/lotes", status_code=201)
async def criar_lote(lote: Lote):
    await app.state.db.lotes.update_one({"codigo": lote.codigo}, {"$set": lote.model_dump()}, upsert=True)
    return {"message": "Lote salvo", "codigo": lote.codigo}


@app.get("/api/movimentacoes")
async def listar_movimentacoes(produto: str | None = None):
    filtro = {"produto": produto} if produto else {}
    return [clean_document(doc) async for doc in app.state.db.movimentacoes.find(filtro).sort("data_hora", -1)]


@app.post("/api/movimentacoes", status_code=201)
async def criar_movimentacao(movimentacao: Movimentacao):
    await app.state.db.movimentacoes.insert_one(movimentacao.model_dump())
    return {"message": "Movimentação registrada"}


@app.get("/api/alertas")
async def listar_alertas():
    return [clean_document(doc) async for doc in app.state.db.alertas.find({}).sort("data_emissao", -1)]


@app.post("/api/alertas", status_code=201)
async def criar_alerta(alerta: Alerta):
    await app.state.db.alertas.insert_one(alerta.model_dump())
    return {"message": "Alerta registrado"}


@app.get("/api/locais")
async def listar_locais():
    return [clean_document(doc) async for doc in app.state.db.locais.find({}).sort("nome", 1)]


@app.post("/api/locais", status_code=201)
async def criar_local(local: Local):
    await app.state.db.locais.update_one({"nome": local.nome}, {"$set": local.model_dump()}, upsert=True)
    return {"message": "Local salvo", "nome": local.nome}


@app.get("/api/notas-fiscais")
async def listar_notas_fiscais():
    return [clean_document(doc) async for doc in app.state.db.notas_fiscais.find({}).sort("numero", 1)]


@app.post("/api/notas-fiscais", status_code=201)
async def criar_nota_fiscal(nota: NotaFiscal):
    await app.state.db.notas_fiscais.update_one(
        {"numero": nota.numero},
        {"$set": nota.model_dump()},
        upsert=True,
    )
    return {"message": "Nota fiscal salva", "numero": nota.numero}
