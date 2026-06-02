# AECODE Revenue & Enrollment OS

Dashboard ejecutivo avanzado generado desde la pestana `BBDD Ventas General`.

## Estado

V2 estatica, sanitizada y lista para GitHub Pages.

## Capas del dashboard

- Ventas cobradas y pendientes.
- Usuarios anonimos e inscritos activos.
- Productos, lineas y cursos.
- Medios de pago y condiciones comerciales.
- Riesgos de cobranza, datos y trazabilidad.

## Ejecutar localmente

Abrir `index.html` en el navegador o servir la carpeta con un servidor estatico.

## Actualizar datos

1. Descargar/exportar el Google Sheet como XLSX en `outputs/bbdd-ventas-general-source.xlsx`.
2. Ejecutar `scripts/build-data.py`.
3. Verificar `data/dashboard-data.json`.

## Privacidad

El dashboard no incluye nombres, correos, telefonos, contactos ni links de comprobantes. Los usuarios se cuentan mediante identificadores anonimos generados localmente.
