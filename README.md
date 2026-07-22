# Rayito

Wallet web autocustodial de Bitcoin construida sobre [Wavelength SDK](https://wavelength.lightning.engineering/introduction/what-is-wavelength-sdk/). Corre el daemon dentro del navegador mediante WebAssembly y usa la configuración pública de Bitcoin Signet.

## Qué incluye

- Creación de una wallet protegida por contraseña.
- Respaldo obligatorio y verificación de la frase de 24 palabras.
- Desbloqueo local en visitas posteriores.
- Restauración con recuperación asistida de saldo e historial.
- Balance y actividad en vivo.
- Recepción Lightning, dirección de depósito on-chain y envío con cotización previa.
- Runtime WASM oficial `v0.1.0`, fijado a la misma versión del SDK.

## Ejecutar

Requiere Node.js 20 o posterior.

```bash
npm install
npm run dev
```

Abrí `http://localhost:5173`. El servidor de Vite ya entrega los headers COOP/COEP necesarios para `SharedArrayBuffer` y OPFS.

```bash
npm test
npm run lint
npm run build
```

## Modelo de seguridad

La semilla se genera en el navegador y queda cifrada en OPFS. Rayito y Wavelength no reciben las claves. Wavelength provee el runtime y conecta la wallet con Ark, Esplora y el servidor de swaps Lightning. El operador coordina la salida rápida, pero el usuario conserva una ruta unilateral hacia Bitcoin.

La app usa **Signet** y el SDK está en estado alpha: sólo se deben usar sats de prueba. Mainnet todavía no tiene un preset público, exige endpoints propios, `allowMainnet: true` y acceso aprobado por Lightning Labs.

## Runtime

Los ocho archivos requeridos viven en `public/wavewalletdk/v0.1.0/`. Al actualizar `@lightninglabs/wavelength-web`, también hay que descargar el bundle WASM de la versión indicada por `RUNTIME_MANIFEST_VERSION`; mezclar versiones no es seguro.

`wavewalletdk.wasm` se versiona con Git LFS porque supera el límite de 100 MiB
por archivo de GitHub. Instalá Git LFS y ejecutá `git lfs install` antes de
clonar o publicar el repositorio; la variante comprimida permanece en Git
normal.

Documentación relevante: [quickstart web](https://wavelength.lightning.engineering/web/get-started/quickstart/), [claves y recuperación](https://wavelength.lightning.engineering/concepts/keys-backup-and-recovery/), [runtime assets](https://wavelength.lightning.engineering/web/get-started/hosting-runtime-assets/) y [cross-origin isolation](https://wavelength.lightning.engineering/web/get-started/cross-origin-isolation/).
