import duckdb
import os
import re
import math
import pandas as pd

class DatabaseManager:
    def __init__(self):
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        self.duck_path = os.path.join(base_dir, '3_Base_Analitica_Final', 'acidentes.duckdb')
        self.csv_path = os.path.join(base_dir, '3_Base_Analitica_Final', 'base_analitica_PI2_2022_2025_enxuta.csv')
        self.veic_path = os.path.join(base_dir, '3_Base_Analitica_Final', 'veiculos_rmbs_lookup.csv')
        
        # Conexao read-only se existir arquivo DuckDB pre-compilado (ultra-rapido para serverless/cloud)
        if os.path.exists(self.duck_path):
            self.con = duckdb.connect(database=self.duck_path, read_only=True)
            print(f"[*] DuckDB conectado em arquivo otimizado: {self.duck_path}")
        else:
            if not os.path.exists(self.csv_path):
                self.csv_path = os.path.join(base_dir, '3_Base_Analitica_Final', 'base_analitica_PI2_2022_2025.csv')
            print(f"[*] Inicializando DuckDB OLAP em memoria com base: {self.csv_path}")
            self.con = duckdb.connect(database=':memory:')
            self._load_table()

    def _load_table(self):
        if os.path.exists(self.veic_path):
            query = f"""
                CREATE OR REPLACE TABLE acidentes AS 
                SELECT a.*,
                       COALESCE(v.env_bicicleta, 0) as env_bicicleta,
                       COALESCE(v.env_moto, 0) as env_moto,
                       COALESCE(v.env_auto, 0) as env_auto,
                       COALESCE(v.env_caminhao, 0) as env_caminhao,
                       COALESCE(v.env_onibus, 0) as env_onibus
                FROM read_csv_auto('{self.csv_path.replace(os.sep, '/')}', header=True) a
                LEFT JOIN read_csv_auto('{self.veic_path.replace(os.sep, '/')}', header=True) v
                  ON a.id_acidente = v.id_acidente;
            """
        else:
            query = f"""
                CREATE OR REPLACE TABLE acidentes AS 
                SELECT *, 0 as env_bicicleta, 0 as env_moto, 0 as env_auto, 0 as env_caminhao, 0 as env_onibus
                FROM read_csv_auto('{self.csv_path.replace(os.sep, '/')}', header=True);
            """
        self.con.execute(query)
        total = self.con.execute("SELECT COUNT(*) FROM acidentes").fetchone()[0]
        print(f"[OK] DuckDB inicializado com {total:,} registros em memória.")

    def reload(self):
        self._load_table()

    def _build_where(self, ano=None, municipio=None, tipo_acidente=None, 
                     risco_pista_molhada=None, logradouro=None, bairro=None, 
                     mes=None, data_acidente=None, lat=None, lng=None, radius_km=None):
        clauses = []
        if ano and str(ano).isdigit() and int(ano) > 0:
            clauses.append(f"ano = {int(ano)}")
        if municipio and municipio != 'TODOS':
            mun_clean = str(municipio).replace("'", "''").upper()
            clauses.append(f"municipio = '{mun_clean}'")
        if tipo_acidente and tipo_acidente != 'TODOS':
            tipo_clean = str(tipo_acidente).replace("'", "''").upper()
            clauses.append(f"tipo_acidente = '{tipo_clean}'")
        if risco_pista_molhada is not None and str(risco_pista_molhada) in ['0', '1']:
            clauses.append(f"risco_pista_molhada = {int(risco_pista_molhada)}")
        if logradouro and logradouro != 'TODOS':
            log_clean = str(logradouro).replace("'", "''").upper()
            clauses.append(f"logradouro = '{log_clean}'")
        if bairro and bairro != 'TODOS':
            bai_clean = str(bairro).replace("'", "''").upper()
            clauses.append(f"bairro = '{bai_clean}'")
        if mes and str(mes).isdigit() and 1 <= int(mes) <= 12:
            clauses.append(f"mes = {int(mes)}")
        if data_acidente and re.match(r'^\d{4}-\d{2}-\d{2}$', str(data_acidente)):
            clauses.append(f"data_acidente = '{str(data_acidente)}'")
            
        # Filtro de proximidade espacial (quando clicado em coordenadas no mapa)
        if lat is not None and lng is not None:
            try:
                f_lat = float(lat)
                f_lng = float(lng)
                r = float(radius_km) if radius_km else 0.8  # raio padrão de 800m
                dlat = r / 111.0
                dlng = r / 102.0
                clauses.append(f"CAST(latitude AS DOUBLE) BETWEEN {f_lat - dlat} AND {f_lat + dlat}")
                clauses.append(f"CAST(longitude AS DOUBLE) BETWEEN {f_lng - dlng} AND {f_lng + dlng}")
            except (ValueError, TypeError):
                pass
            
        return ("WHERE " + " AND ".join(clauses)) if clauses else ""

    def get_kpis(self, ano=None, municipio=None, tipo_acidente=None,
                 risco_pista_molhada=None, logradouro=None, bairro=None, 
                 mes=None, data_acidente=None, lat=None, lng=None, radius_km=None):
        where = self._build_where(ano=ano, municipio=municipio, tipo_acidente=tipo_acidente,
                                  risco_pista_molhada=risco_pista_molhada, logradouro=logradouro,
                                  bairro=bairro, mes=mes, data_acidente=data_acidente,
                                  lat=lat, lng=lng, radius_km=radius_km)
        query = f"""
            SELECT 
                COUNT(*) as total_acidentes,
                COALESCE(SUM(acidente_fatal), 0) as total_fatais,
                COALESCE(SUM(acidente_com_vitima), 0) as total_com_vitimas,
                COALESCE(SUM(risco_pista_molhada), 0) as total_pista_molhada,
                COALESCE(SUM(tipo_via_rodovia), 0) as total_rodovias,
                ROUND(AVG(temperatura_c), 1) as temp_media
            FROM acidentes {where};
        """
        row = self.con.execute(query).fetchone()
        tot = row[0] if row[0] > 0 else 1
        return {
            "total_acidentes": row[0],
            "total_fatais": row[1],
            "taxa_letalidade": round((row[1] / tot) * 100, 2),
            "total_com_vitimas": row[2],
            "taxa_com_vitimas": round((row[2] / tot) * 100, 2),
            "total_pista_molhada": row[3],
            "taxa_pista_molhada": round((row[3] / tot) * 100, 2),
            "total_rodovias": row[4],
            "taxa_rodovias": round((row[4] / tot) * 100, 2),
            "temp_media": row[5] or 23.6
        }

    def get_municipios_chart(self, ano=None, tipo_acidente=None, risco_pista_molhada=None,
                             mes=None, data_acidente=None, logradouro=None, bairro=None):
        where = self._build_where(ano=ano, municipio=None, tipo_acidente=tipo_acidente,
                                  risco_pista_molhada=risco_pista_molhada, logradouro=logradouro,
                                  bairro=bairro, mes=mes, data_acidente=data_acidente)
        query = f"""
            SELECT municipio, COUNT(*) as qtd
            FROM acidentes {where}
            GROUP BY municipio
            ORDER BY qtd DESC;
        """
        rows = self.con.execute(query).fetchall()
        return {
            "labels": [r[0] for r in rows],
            "data": [r[1] for r in rows]
        }

    def get_temporal_chart(self, ano=None, municipio=None, tipo_acidente=None,
                           risco_pista_molhada=None, logradouro=None, bairro=None):
        where = self._build_where(ano=ano, municipio=municipio, tipo_acidente=tipo_acidente,
                                  risco_pista_molhada=risco_pista_molhada, logradouro=logradouro,
                                  bairro=bairro, mes=None, data_acidente=None)
        query = f"""
            SELECT ano, mes, COUNT(*) as qtd_acidentes, ROUND(AVG(chuva_acum_3h), 2) as media_chuva
            FROM acidentes {where}
            GROUP BY ano, mes
            ORDER BY ano, mes;
        """
        rows = self.con.execute(query).fetchall()
        return {
            "labels": [f"{r[1]:02d}/{r[0]}" for r in rows],
            "acidentes": [r[2] for r in rows],
            "chuva_media": [r[3] for r in rows]
        }

    def get_severidade_chart(self, ano=None, municipio=None, tipo_acidente=None,
                             logradouro=None, bairro=None, mes=None, data_acidente=None):
        where = self._build_where(ano=ano, municipio=municipio, tipo_acidente=tipo_acidente,
                                  risco_pista_molhada=None, logradouro=logradouro,
                                  bairro=bairro, mes=mes, data_acidente=data_acidente)
        query = f"""
            SELECT 
                risco_pista_molhada,
                COUNT(*) as qtd_cond,
                COALESCE(SUM(acidente_com_vitima), 0) as qtd_vit,
                COALESCE(SUM(acidente_fatal), 0) as qtd_fat,
                ROUND(AVG(acidente_com_vitima) * 100, 2) as pct_vitima,
                ROUND(AVG(acidente_fatal) * 100, 2) as pct_fatal
            FROM acidentes {where}
            GROUP BY risco_pista_molhada
            ORDER BY risco_pista_molhada;
        """
        rows = self.con.execute(query).fetchall()
        res = {
            "labels": ["Pista Seca", "Pista Molhada"],
            "vitimas": [0.0, 0.0],
            "fatais": [0.0, 0.0],
            "totais_condicao": [0, 0],
            "qtd_vitimas": [0, 0],
            "qtd_fatais": [0, 0]
        }
        for r in rows:
            idx = 1 if r[0] == 1 else 0
            res["totais_condicao"][idx] = int(r[1] or 0)
            res["qtd_vitimas"][idx] = int(r[2] or 0)
            res["qtd_fatais"][idx] = int(r[3] or 0)
            res["vitimas"][idx] = float(r[4] or 0.0)
            res["fatais"][idx] = float(r[5] or 0.0)
        return res

    def get_tipos_chart(self, ano=None, municipio=None, risco_pista_molhada=None,
                        logradouro=None, bairro=None, mes=None, data_acidente=None):
        where_base = self._build_where(ano=ano, municipio=municipio, tipo_acidente=None,
                                       risco_pista_molhada=risco_pista_molhada, logradouro=logradouro,
                                       bairro=bairro, mes=mes, data_acidente=data_acidente)
        if where_base:
            where = f"{where_base} AND tipo_acidente != 'NI'"
            where_ni = f"{where_base} AND tipo_acidente = 'NI'"
        else:
            where = "WHERE tipo_acidente != 'NI'"
            where_ni = "WHERE tipo_acidente = 'NI'"
            
        query = f"""
            SELECT tipo_acidente, COUNT(*) as qtd
            FROM acidentes {where}
            GROUP BY tipo_acidente
            ORDER BY qtd DESC
            LIMIT 7;
        """
        rows = self.con.execute(query).fetchall()
        ni_count = self.con.execute(f"SELECT COUNT(*) FROM acidentes {where_ni}").fetchone()[0]
        return {
            "labels": [r[0] for r in rows],
            "data": [r[1] for r in rows],
            "total_ni": int(ni_count or 0)
        }

    def get_hotspots(self, ano=None, municipio=None, tipo_acidente=None,
                     risco_pista_molhada=None, logradouro=None, bairro=None,
                     mes=None, data_acidente=None, lat=None, lng=None, radius_km=None, limit=2500):
        where_base = self._build_where(ano=ano, municipio=municipio, tipo_acidente=tipo_acidente,
                                       risco_pista_molhada=risco_pista_molhada, logradouro=logradouro,
                                       bairro=bairro, mes=mes, data_acidente=data_acidente,
                                       lat=lat, lng=lng, radius_km=radius_km)
        spatial_cond = "latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0"
        where = f"{where_base} AND {spatial_cond}" if where_base else f"WHERE {spatial_cond}"
        
        has_bairro = True
        try:
            self.con.execute("SELECT bairro FROM acidentes LIMIT 1")
        except Exception:
            has_bairro = False
            
        bairro_col = "bairro" if has_bairro else "'NI' as bairro"
        
        query = f"""
            SELECT 
                id_acidente,
                latitude, 
                longitude, 
                CASE 
                    WHEN acidente_fatal = 1 THEN 1.0 
                    WHEN acidente_com_vitima = 1 THEN 0.7 
                    ELSE 0.4 
                END as peso,
                municipio,
                {bairro_col},
                logradouro,
                tipo_acidente,
                data_acidente,
                risco_pista_molhada,
                qtde_obitos,
                qtde_feridos
            FROM acidentes {where}
            ORDER BY RANDOM()
            LIMIT {limit};
        """
        rows = self.con.execute(query).fetchall()
        points = []
        for r in rows:
            points.append({
                "id": r[0],
                "lat": float(r[1]),
                "lng": float(r[2]),
                "intensity": r[3],
                "municipio": r[4],
                "bairro": r[5] or "NI",
                "logradouro": r[6] or "NI",
                "tipo": r[7],
                "data": str(r[8]),
                "pista_molhada": int(r[9]),
                "obitos": int(r[10]),
                "feridos": int(r[11])
            })
        return points

    def get_scientific_insights(self, ano=None, municipio=None, tipo_acidente=None,
                                risco_pista_molhada=None, logradouro=None, bairro=None,
                                mes=None, data_acidente=None):
        """Calcula síntese científica e evidências das hipóteses para o recorte atual."""
        where = self._build_where(ano=ano, municipio=municipio, tipo_acidente=tipo_acidente,
                                  risco_pista_molhada=risco_pista_molhada, logradouro=logradouro,
                                  bairro=bairro, mes=mes, data_acidente=data_acidente)
        
        # 1. Indicadores básicos do recorte
        q_stats = f"""
            SELECT 
                COUNT(*) as total,
                COALESCE(SUM(acidente_com_vitima), 0) as vitimas,
                COALESCE(SUM(acidente_fatal), 0) as fatais,
                COALESCE(SUM(risco_pista_molhada), 0) as molhada,
                COALESCE(SUM(tipo_via_rodovia), 0) as rodovias,
                COALESCE(SUM(sazonalidade_turistica), 0) as turismo,
                ROUND(AVG(chuva_acum_3h), 2) as media_chuva,
                ROUND(AVG(temperatura_c), 1) as media_temp
            FROM acidentes {where};
        """
        r = self.con.execute(q_stats).fetchone()
        raw_total = int(r[0] or 0)
        total = raw_total if raw_total > 0 else 1
        vitimas = int(r[1] or 0)
        fatais = int(r[2] or 0)
        molhada = int(r[3] or 0)
        rodovias = int(r[4] or 0)
        turismo = int(r[5] or 0)
        media_chuva = r[6] or 0.0

        taxa_vitimas = round((vitimas / total) * 100, 2) if raw_total > 0 else 0.0
        taxa_letalidade = round((fatais / total) * 100, 2) if raw_total > 0 else 0.0
        taxa_rodovias = round((rodovias / total) * 100, 2) if raw_total > 0 else 0.0
        taxa_molhada = round((molhada / total) * 100, 2) if raw_total > 0 else 0.0

        # 2. Odds Ratio comparativo chuva x vítimas no recorte
        q_or = f"""
            SELECT 
                COUNT(CASE WHEN risco_pista_molhada = 1 AND acidente_com_vitima = 1 THEN 1 END) as a,
                COUNT(CASE WHEN risco_pista_molhada = 1 AND acidente_com_vitima = 0 THEN 1 END) as b,
                COUNT(CASE WHEN risco_pista_molhada = 0 AND acidente_com_vitima = 1 THEN 1 END) as c,
                COUNT(CASE WHEN risco_pista_molhada = 0 AND acidente_com_vitima = 0 THEN 1 END) as d
            FROM acidentes {where};
        """
        r_or = self.con.execute(q_or).fetchone()
        a, b, c, d = int(r_or[0]), int(r_or[1]), int(r_or[2]), int(r_or[3])
        n_tot = a + b + c + d

        if n_tot == 0:
            odds_ratio = None
            elevacao_pct = None
            chi2_val = None
            p_val = None
            hipotese_confirmada = False
        else:
            if b * c > 0 and a > 0 and d > 0:
                odds_ratio = round((a * d) / (b * c), 3)
            elif (a + b) > 0 and (c + d) > 0 and (a + c) > 0 and (b + d) > 0:
                # Correção de continuidade de Haldane-Anscombe (+0,5) quando há célula zero (Agresti, 2013)
                odds_ratio = round(((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5)), 3)
            else:
                odds_ratio = 0.0

            elevacao_pct = round((odds_ratio - 1) * 100, 1)
            denom_chi = (a + b) * (c + d) * (a + c) * (b + d)
            if denom_chi > 0 and n_tot > 0:
                chi2_val = round((n_tot * ((a * d - b * c) ** 2)) / denom_chi, 2)
                p_val = math.erfc(math.sqrt(chi2_val / 2.0))
            else:
                chi2_val = 0.0
                p_val = 1.0
            hipotese_confirmada = (odds_ratio >= 1.05) and (p_val < 0.05)

        # 3. Formulação da Hipótese e Diagnóstico Científico
        loc_texto = f"no município de {municipio}" if municipio and municipio != 'TODOS' else "na Região Metropolitana da Baixada Santista"
        tempo_texto = f"no ano de {ano}" if ano else "no período 2022–2025"
        if mes:
            nomes_meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
            tempo_texto += f" ({nomes_meses[int(mes)]})"

        if raw_total == 0:
            if str(ano) == '2025' and str(mes) == '11':
                diagnostico = (
                    "Para Novembro de 2025, a SENATRAN/RENAEST omitiu a carga de sinistros da UF=SP nos pacotes nacionais "
                    "Acidentes_DadosAbertos_20260312.csv (11-2025.zip) e Acidentes_DadosAbertos_20260412.csv (12-2025.zip), "
                    "saltando de Outubro/2025 diretamente para Dezembro/2025."
                )
            else:
                diagnostico = f"Não há registros de sinistros para o filtro selecionado ({loc_texto}, {tempo_texto})."
            evidencia = "Sem ocorrências na tabela de contingência 2×2 para cálculo de Odds Ratio ou Qui-Quadrado."
        else:
            nota_vit = ""
            if vitimas == fatais and vitimas > 0:
                nota_vit = (
                    " Nota técnica RENAEST: a partir de março/2023 (e em 2024–2025), a SENATRAN deixou de exportar a "
                    "contagem de feridos não fatais (qtde_feridosilesos = 0 e gravidade_lesao = 'NAO INFORMADO') para o Estado de São Paulo, "
                    "mantendo apenas o registro de óbitos (qtde_obitos > 0); por isso os sinistros com vítimas coincidem com os fatais neste período."
                )
            diagnostico = (
                f"Para o recorte analisado ({loc_texto}, {tempo_texto}), registraram-se {raw_total:,} sinistros, "
                f"com {vitimas:,} ocorrências com vítimas contabilizadas ({taxa_vitimas}%) e {fatais:,} sinistros fatais (letalidade de {taxa_letalidade}%). "
                f"O risco de pista molhada (chuva acumulada 3h > 5,0 mm nas estações INMET / Haversine-IDW ou pista molhada no B.O.) "
                f"esteve presente em {molhada:,} casos ({taxa_molhada}%), e eixos rodoviários concentraram {taxa_rodovias}% das ocorrências.{nota_vit}"
            )

            p_str = "p < 0,001" if p_val < 0.001 else f"p = {p_val:.3f}"
            if odds_ratio >= 1.05:
                evidencia = (
                    f"Odds Ratio calculado em OR = {odds_ratio:.3f} (limiar: chuva_acum_3h > 5,0 mm — Theofilatos & Yannis, 2014; Edwards, 1998; WMO, 2018). "
                    f"Sob condições de chuva crítica e asfalto molhado, a chance relativa de sinistros com vítimas é +{elevacao_pct}% superior "
                    f"em comparação à pista seca (χ² = {chi2_val}, {p_str} — Agresti, 2013)."
                )
            else:
                evidencia = (
                    f"Odds Ratio calculado em OR = {odds_ratio:.3f} (χ² = {chi2_val}, {p_str}). "
                    f"Neste recorte específico (a={a}, b={b}, c={c}, d={d}), a exposição à pista molhada não elevou a razão de chances "
                    f"em relação à pista seca (variação de {elevacao_pct}%)."
                )

        # Recomendações de mitigação de engenharia e fiscalização
        recomendacoes = [
            "Sinalização Luminosa Adaptativa: Redução dinâmica de velocidade em rodovias (SP-055, Anchieta e Imigrantes) sob alerta de precipitação acumulada > 5,0 mm (INMET).",
            "Manutenção de Drenagem e Asfalto Poroso (SMA): Intervenção em pontos críticos de aquaplanagem e acúmulo de lâmina d'água (Elvik et al., 2009).",
            "Fiscalização Ostensiva em Horários Críticos: Reforço de patrulhamento e radares nos turnos da noite/madrugada, onde a taxa de letalidade atinge os maiores índices."
        ]
        if taxa_rodovias > 25:
            recomendacoes.append("Defensas Metálicas e Iluminação Rodoviária: Implementação de guardrails contínuos em trechos com alta incidência de choques e tombamentos.")

        return {
            "hipotese_validada": hipotese_confirmada,
            "odds_ratio": odds_ratio,
            "elevacao_risco_pct": elevacao_pct,
            "chi2": chi2_val,
            "p_valor": round(p_val, 6),
            "tabela": {"a": a, "b": b, "c": c, "d": d},
            "diagnostico": diagnostico,
            "evidencia_estatistica": evidencia,
            "recomendacoes": recomendacoes,
            "taxa_letalidade": taxa_letalidade,
            "taxa_vitimas": taxa_vitimas,
            "taxa_rodovias": taxa_rodovias,
            "media_chuva_mm": media_chuva
        }

    def execute_custom_query(self, sql_query):
        """Executa consultas analíticas somente leitura para o agente de IA."""
        cleaned = sql_query.strip().lower()
        for block in ['drop', 'delete', 'update', 'insert', 'alter', 'create', 'truncate', 'replace']:
            if f"{block} " in cleaned:
                return {"error": "Comando não permitido. Apenas consultas SELECT são autorizadas."}
        try:
            df = self.con.execute(sql_query).fetchdf()
            return {"columns": list(df.columns), "rows": df.to_dict(orient='records')}
        except Exception as e:
            return {"error": str(e)}

# Instância Singleton
db = DatabaseManager()
