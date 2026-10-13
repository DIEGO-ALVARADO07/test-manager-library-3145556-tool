# test-manager-library-3145556-tool

> **Prueba técnica · Ficha ADSO 3145556**
> Entrega: **martes 13 de octubre de 2026, a las 5:00 p. m.** (17:00, hora Colombia).

Utilidades de *Manager Library*: el **sembrador de datos de demostración** (T-21). Habla **solo con la API** (nunca con SQL), como exige `data-model.md` §9.

## Qué siembra

| Fase | Qué hace | Reloj de la API |
|---|---|---|
| `base` | 1 bibliotecario, 41 libros de las 5 categorías, 10 socios | real |
| `past` | 3 préstamos que quedarán **vencidos** y 2 prestados y devueltos | **−20 días** ([ADR-006](https://github.com/code-sena/test-manager-library-3145556-docs/blob/main/spec-laravel/adr/adr-006-reloj-desplazable-para-el-sembrador.md)) |
| `present` | 10 préstamos más (máx. 3 libros por socio, sin socios con vencidos) y 4 devoluciones | real |
| `verify` | Imprime la evidencia: 3 líneas vencidas, 15 préstamos, filas en el reporte | real |
| `load` | Crea libros sintéticos hasta `--books=N` y mide la búsqueda (RNF-1) | real |

**Por qué hace falta mover el reloj:** la API pone `loaned_at` con su propio reloj y no acepta fechas del cliente (HU-06), así que un préstamo vencido solo se puede crear si el servidor «vive» en el pasado. La API lo permite con `CLOCK_OFFSET_DAYS` (0 por defecto).

## Cómo correrlo

Requiere Node 20+ y el sistema levantado con `infra` (`docker compose up -d`).

```bash
cp .env.example .env     # ADMIN_USERNAME y ADMIN_PASSWORD: los mismos del entorno de la API
INFRA_DIR=../test-manager-library-3145556-infra ./seed/run-all.sh
```

`run-all.sh` ejecuta las fases en orden y reinicia el servicio `api` con el reloj desplazado solo durante `past`. También se puede hacer a mano:

```bash
node seed/seed.mjs --phase=base
# reiniciar la api con CLOCK_OFFSET_DAYS=-20, luego:
node seed/seed.mjs --phase=past
# reiniciar la api con CLOCK_OFFSET_DAYS=0, luego:
node seed/seed.mjs --phase=present
node seed/seed.mjs --phase=verify
```

Es repetible: un `409` (ISBN, documento o usuario ya existente) se interpreta como «ya sembrado».

## Evidencia (T-21)

```text
overdue lines: 3 (expected 3)
loans: 15 (expected 15)
report rows: 19
```

`GET /loans/overdue` devuelve **3** líneas y `GET /reports/most-borrowed` tiene filas.

## Prueba de carga (RNF-1)

```bash
node seed/seed.mjs --phase=load --books=5000
```

Crea libros por la API hasta llegar a 5 000 y mide 60 búsquedas; el resultado debe ser menor a 300 ms.

Resultado en la prueba del 13 de octubre de 2026 (API y base en Docker, equipo local):

```text
RNF-1: 5000 books, search p95 = 78 ms, max = 97 ms (limit 300 ms)
```
