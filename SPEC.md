# SPEC - AECODE Sales Dashboard

## Arquitectura

- `index.html`: estructura de la experiencia.
- `styles.css`: sistema visual responsive.
- `app.js`: filtros, calculos de vista y render.
- `data/dashboard-data.json`: data agregada y registros anonimizados.
- `scripts/build-data.py`: generador desde XLSX.

## Fuente

Google Sheet: `BBDD Ventas General`.

## Campos usados

- Fecha.
- Programa.
- Tipo.
- Modalidad.
- Inversion.
- Moneda.
- Tipo de pago.
- Canal de pago.
- Estado de pago.
- Validacion.

## Sanitizacion

Se excluyen de la salida publica:

- Cliente.
- Contacto.
- Correo.
- Links de pagos.
- Comentarios.

## Flujo

Fuente XLSX -> generador local -> JSON agregado -> dashboard estatico -> GitHub Pages.

## Riesgos

- No hay conversion FX; PEN y USD se muestran separados.
- La calidad depende de consistencia de estados (`PAGADO`, `PENDIENTE`, `ANULADO`, `RETIRADO`).
- Los registros sin fecha o programa quedan fuera de metricas temporales.

