# test-manager-library-3145556-tool

> **Prueba técnica · Ficha ADSO 3145556**
> Entrega: **martes 13 de octubre de 2026, a las 5:00 p. m.** (17:00, hora Colombia).

Este repositorio guarda las **utilidades** de *Manager Library*: el sembrador de datos de demostración, que usa la API. **Empieza vacío a propósito**: se construye en el fork de cada aprendiz.

## Instrucciones

Cada aprendiz debe **crear el fork** de los seis repositorios del proyecto y **resolver el proyecto
con el spec planteado**.

1. Hacer fork, a su cuenta de GitHub, de cada repositorio de la tabla del final.
2. Leer el spec en [`test-manager-library-3145556-docs`](https://github.com/code-sena/test-manager-library-3145556-docs).
   Se entrega en dos versiones: `spec-python/` y `spec-.net/`.
3. Desarrollar en los forks.

## El reto se desarrolla con React y PHP (Laravel)

El spec está escrito para Python y para .NET, pero el reto **no** se hace en esos lenguajes:

| Capa | Tecnología del reto |
|---|---|
| Frontend | React |
| Backend | PHP con Laravel |

Lo que el spec define sobre el negocio —historias, criterios de aceptación, reglas, contrato de la
API, modelo de datos— se respeta. Lo que define sobre la tecnología se traduce a React y Laravel.

## La prueba no consiste en escribir el código

El propósito principal es ver la **capacidad de desempeño con SDD** (*Spec-Driven Development*,
desarrollo guiado por especificación): cómo se lee, se interpreta y se aplica una especificación
para llevarla a un stack distinto. El código es el medio, no el fin.

## Entrega

Cuenta lo que quede **subido a los forks antes de las 5:00 p. m.** (17:00). Lo que llegue después no se revisa.
No hay prórroga: suban avances parciales con commits pequeños durante la prueba.

## Los seis repositorios

| Repositorio | Qué va ahí |
|---|---|
| [`test-manager-library-3145556-docs`](https://github.com/code-sena/test-manager-library-3145556-docs) | El spec: `spec-python/` y `spec-.net/` |
| [`test-manager-library-3145556-api`](https://github.com/code-sena/test-manager-library-3145556-api) | Backend en PHP (Laravel) |
| [`test-manager-library-3145556-app`](https://github.com/code-sena/test-manager-library-3145556-app) | Frontend en React |
| [`test-manager-library-3145556-page`](https://github.com/code-sena/test-manager-library-3145556-page) | Sitio público estático de presentación |
| [`test-manager-library-3145556-infra`](https://github.com/code-sena/test-manager-library-3145556-infra) | Contenedores, red, volúmenes y motor de base de datos vacío |
| [`test-manager-library-3145556-tool`](https://github.com/code-sena/test-manager-library-3145556-tool) | Utilidades: sembrador de datos de demostración |

---

## Sembrador de datos de demostración (T-21)

El sembrador habla **solo con la API** (nunca con SQL), como exige `data-model.md` §9.

### Qué siembra

| Fase | Qué hace | Reloj de la API |
|---|---|---|
| `base` | 1 bibliotecario, 41 libros de las 5 categorías, 10 socios | real |
| `past` | 3 préstamos que quedarán **vencidos** y 2 prestados y devueltos | **−20 días** ([ADR-006](https://github.com/code-sena/test-manager-library-3145556-docs/blob/main/spec-laravel/adr/adr-006-reloj-desplazable-para-el-sembrador.md)) |
| `present` | 10 préstamos más (máx. 3 libros por socio, sin socios con vencidos) y 4 devoluciones | real |
| `verify` | Imprime la evidencia: 3 líneas vencidas, 15 préstamos, filas en el reporte | real |
| `load` | Crea libros sintéticos hasta `--books=N` y mide la búsqueda (RNF-1) | real |

**Por qué hace falta mover el reloj:** la API pone `loaned_at` con su propio reloj y no acepta fechas del cliente (HU-06), así que un préstamo vencido solo se puede crear si el servidor «vive» en el pasado. La API lo permite con `CLOCK_OFFSET_DAYS` (0 por defecto).

### Cómo correrlo

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

### Evidencia (T-21)

```text
overdue lines: 3 (expected 3)
loans: 15 (expected 15)
report rows: 19
```

`GET /loans/overdue` devuelve **3** líneas y `GET /reports/most-borrowed` tiene filas.

### Prueba de carga (RNF-1)

```bash
node seed/seed.mjs --phase=load --books=5000
```

Crea libros por la API hasta llegar a 5 000 y mide 60 búsquedas; el resultado debe ser menor a 300 ms.

Resultado en la prueba del 13 de octubre de 2026 (API y base en Docker, equipo local):

```text
RNF-1: 5000 books, search p95 = 78 ms, max = 97 ms (limit 300 ms)
```
