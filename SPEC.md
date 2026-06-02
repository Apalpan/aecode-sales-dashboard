# SPEC - AECODE Revenue & Enrollment OS

## Arquitectura

- `index.html`: estructura de la experiencia.
- `styles.css`: sistema visual responsive.
- `app.js`: filtros, calculos de vista y render por ventas, usuarios, productos, pagos y riesgos.
- `data/dashboard-data.json`: data agregada, registros anonimizados y usuarios hash.
- `scripts/build-data.py`: generador desde XLSX.

## Fuente

Google Sheet: `BBDD Ventas General`.

## Campos usados

- Fecha.
- Programa / curso.
- Tipo.
- Modalidad.
- Inversion.
- Moneda.
- Tipo de pago.
- Canal de pago.
- Estado de pago.
- Validacion.
- Usuario anonimo derivado localmente.
- Linea de producto calculada.

## Sanitizacion

Se excluyen de la salida publica:

- Cliente.
- Contacto.
- Correo.
- Links de pagos.
- Comentarios.

Los usuarios se publican solo como hashes irreversibles, usados para conteos anonimos y recurrencia.

## Flujo

Fuente XLSX -> generador local -> JSON anonimizado -> dashboard estatico -> GitHub Pages.

## Riesgos

- No hay conversion FX oficial; PEN y USD se muestran separados.
- La calidad depende de consistencia de estados (`PAGADO`, `PENDIENTE`, `ANULADO`, `RETIRADO`).
- Los registros sin fecha o programa quedan fuera de metricas temporales.
- La recurrencia de usuarios depende de que contacto/correo este registrado en la base original.
