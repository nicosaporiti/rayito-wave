# Rayito

Wallet web autocustodial de Bitcoin construida sobre [Wavelength SDK](https://wavelength.lightning.engineering/introduction/what-is-wavelength-sdk/). Corre el daemon dentro del navegador mediante WebAssembly y usa la configuración pública de Bitcoin Signet.

## Qué incluye

- Interfaz completa en español e inglés, con detección del idioma del navegador.
- Creación de una wallet protegida por contraseña.
- Respaldo obligatorio y verificación de la frase de 24 palabras.
- Desbloqueo local en visitas posteriores.
- Restauración con recuperación asistida de saldo e historial.
- Balance y actividad en vivo.
- Recepción Lightning, dirección de depósito on-chain y envío con cotización previa.
- Runtime WASM oficial `v0.2.0`, fijado a la misma versión del SDK y verificado por digest antes de ejecutarse.

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

## Idiomas

La app se sirve en español e inglés. En la primera visita se elige el idioma a
partir de `navigator.languages` (cualquier variante `es-*` abre en español; el
resto, en inglés) y el selector `ES/EN` del encabezado guarda la preferencia en
`localStorage` bajo `rayito.locale`.

Los textos viven en `src/i18n/messages.ts`. El diccionario español define el
espacio de claves y el inglés se declara como `Record<MessageKey, string>`, así
que una traducción faltante rompe la compilación. Los módulos de `src/lib/`
devuelven claves (`MessageKey`) en lugar de texto y la traducción ocurre al
renderizar, mediante `useI18n()`.

Para agregar un idioma: sumá el tag a `LOCALES`, agregá el diccionario a
`messages` y el formato numérico/de fecha en `INTL_LOCALE` (`src/lib/format.ts`).

## Modelo de seguridad

La semilla se genera en el navegador y queda cifrada en OPFS. Rayito y Wavelength no reciben las claves. Wavelength provee el runtime y conecta la wallet con Ark, Esplora y el servidor de swaps Lightning. El operador coordina la salida rápida, pero el usuario conserva una ruta unilateral hacia Bitcoin.

La app usa **Signet** y el SDK está en estado alpha: sólo se deben usar sats de prueba. Desde Wavelength `v0.2.0` mainnet está abierto al público, pero el SDK no trae un preset: exige configurar los endpoints a mano, `allowMainnet: true` y la verificación de integridad del runtime activa.

Desde el SDK `0.2.0` los envíos a facturas Lightning no usan crédito del servidor salvo que el pedido lo autorice. Rayito pasa `maxCreditSat` (saldo + crédito disponible) y `maxCreditTopupSat` (saldo) para que las facturas chicas sigan funcionando; la revisión del pago muestra la recarga de crédito y el total que sale de la wallet, y el crédito disponible aparece junto al saldo. Si un envío falla, Rayito pide una cotización nueva en lugar de reintentar la anterior.

## Runtime

Los nueve archivos de `RUNTIME_ASSET_FILES` viven en `public/wavewalletdk/v0.2.0/`, sin modificaciones respecto del `Wavewalletdk.wasm.tar.gz` de la [release de wavelength](https://github.com/lightninglabs/wavelength/releases). Al actualizar `@lightninglabs/wavelength-web`, también hay que descargar el bundle de la versión indicada por `RUNTIME_MANIFEST_VERSION`, moverlo a una carpeta con ese nombre y actualizar las rutas de `.gitattributes` y `.vercelignore`; mezclar versiones no es seguro.

El SDK verifica el `.wasm` y los scripts de arranque contra `RUNTIME_ASSET_DIGESTS` y los ejecuta desde URLs `blob:`, por eso la CSP incluye `script-src blob:`. `src/lib/runtime-assets.test.ts` compara los archivos hospedados contra esos digests, así que `npm test` falla si la carpeta no corresponde a la versión instalada o si alguien edita un asset.

`wavewalletdk.wasm` se versiona con Git LFS porque supera el límite de 100 MiB
por archivo de GitHub. Instalá Git LFS y ejecutá `git lfs install` antes de
clonar o publicar el repositorio; la variante comprimida permanece en Git
normal.

Documentación relevante: [quickstart web](https://wavelength.lightning.engineering/web/get-started/quickstart/), [claves y recuperación](https://wavelength.lightning.engineering/concepts/keys-backup-and-recovery/), [runtime assets](https://wavelength.lightning.engineering/web/get-started/hosting-runtime-assets/) y [cross-origin isolation](https://wavelength.lightning.engineering/web/get-started/cross-origin-isolation/).
