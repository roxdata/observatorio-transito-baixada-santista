import os
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Optional, Dict, Any, List
from .database import db

app = FastAPI(
    title="PI2 - Dashboard Analítico",
    description="Sistema de Monitoramento e Análise Estatística de Sinistros de Trânsito e Clima na Baixada Santista",
    version="2.3.0"
)

# Montar arquivos estáticos e templates
static_dir = os.path.join(os.path.dirname(__file__), "static")
templates_dir = os.path.join(os.path.dirname(__file__), "templates")

app.mount("/static", StaticFiles(directory=static_dir), name="static")
templates = Jinja2Templates(directory=templates_dir)

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/kpis")
async def get_kpis(
    ano: int = Query(None),
    municipio: str = Query(None),
    tipo_acidente: str = Query(None),
    risco_pista_molhada: int = Query(None),
    logradouro: str = Query(None),
    bairro: str = Query(None),
    mes: int = Query(None),
    data_acidente: str = Query(None),
    lat: float = Query(None),
    lng: float = Query(None),
    radius_km: float = Query(None)
):
    return db.get_kpis(
        ano=ano, municipio=municipio, tipo_acidente=tipo_acidente,
        risco_pista_molhada=risco_pista_molhada, logradouro=logradouro,
        bairro=bairro, mes=mes, data_acidente=data_acidente,
        lat=lat, lng=lng, radius_km=radius_km
    )

@app.get("/api/charts/municipios")
async def get_chart_municipios(
    ano: int = Query(None),
    tipo_acidente: str = Query(None),
    risco_pista_molhada: int = Query(None),
    mes: int = Query(None),
    data_acidente: str = Query(None),
    logradouro: str = Query(None),
    bairro: str = Query(None)
):
    return db.get_municipios_chart(
        ano=ano, tipo_acidente=tipo_acidente,
        risco_pista_molhada=risco_pista_molhada, mes=mes,
        data_acidente=data_acidente,
        logradouro=logradouro, bairro=bairro
    )

@app.get("/api/charts/temporal")
async def get_chart_temporal(
    ano: int = Query(None),
    municipio: str = Query(None),
    tipo_acidente: str = Query(None),
    risco_pista_molhada: int = Query(None),
    logradouro: str = Query(None),
    bairro: str = Query(None)
):
    return db.get_temporal_chart(
        ano=ano, municipio=municipio, tipo_acidente=tipo_acidente,
        risco_pista_molhada=risco_pista_molhada, logradouro=logradouro,
        bairro=bairro
    )

@app.get("/api/charts/severidade")
async def get_chart_severidade(
    ano: int = Query(None),
    municipio: str = Query(None),
    tipo_acidente: str = Query(None),
    logradouro: str = Query(None),
    bairro: str = Query(None),
    mes: int = Query(None),
    data_acidente: str = Query(None)
):
    return db.get_severidade_chart(
        ano=ano, municipio=municipio, tipo_acidente=tipo_acidente,
        logradouro=logradouro, bairro=bairro, mes=mes,
        data_acidente=data_acidente
    )

@app.get("/api/charts/tipos")
async def get_chart_tipos(
    ano: int = Query(None),
    municipio: str = Query(None),
    risco_pista_molhada: int = Query(None),
    logradouro: str = Query(None),
    bairro: str = Query(None),
    mes: int = Query(None),
    data_acidente: str = Query(None)
):
    return db.get_tipos_chart(
        ano=ano, municipio=municipio, risco_pista_molhada=risco_pista_molhada,
        logradouro=logradouro, bairro=bairro, mes=mes,
        data_acidente=data_acidente
    )

@app.get("/api/map/hotspots")
async def get_map_hotspots(
    ano: int = Query(None),
    municipio: str = Query(None),
    tipo_acidente: str = Query(None),
    risco_pista_molhada: int = Query(None),
    logradouro: str = Query(None),
    bairro: str = Query(None),
    mes: int = Query(None),
    data_acidente: str = Query(None),
    lat: float = Query(None),
    lng: float = Query(None),
    radius_km: float = Query(None),
    limit: int = Query(2500)
):
    return db.get_hotspots(
        ano=ano, municipio=municipio, tipo_acidente=tipo_acidente,
        risco_pista_molhada=risco_pista_molhada, logradouro=logradouro,
        bairro=bairro, mes=mes, data_acidente=data_acidente,
        lat=lat, lng=lng, radius_km=radius_km, limit=limit
    )

@app.get("/api/insights")
async def get_insights(
    ano: int = Query(None),
    municipio: str = Query(None),
    tipo_acidente: str = Query(None),
    risco_pista_molhada: int = Query(None),
    logradouro: str = Query(None),
    bairro: str = Query(None),
    mes: int = Query(None),
    data_acidente: str = Query(None)
):
    return db.get_scientific_insights(
        ano=ano, municipio=municipio, tipo_acidente=tipo_acidente,
        risco_pista_molhada=risco_pista_molhada, logradouro=logradouro,
        bairro=bairro, mes=mes, data_acidente=data_acidente
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app_web.main:app", host="127.0.0.1", port=8000, reload=True)
