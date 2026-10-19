# Actualizar Screencribe: descarga nativa sin librerías

Entrega basada en `main`, commit **dd342d0** de `SVN11X/screencribe`. Los cambios se entregan como archivos; no se han enviado ni publicado en GitHub.

1. Descomprime el ZIP.
2. Copia **el contenido de la carpeta `screencribe/`** a la raíz de tu repositorio. Incluye `.github/`, `index.html`, `src/`, `assets/`, `icons/` y documentación. No anides otra carpeta `screencribe/`.
3. Elimina las rutas de la versión anterior que ya no se usan:

```text
assets/vendor/
src/local-converter.js
src/conversion-plan.js
tests/conversion-plan.test.mjs
```

Aunque queden archivos antiguos en `assets/vendor/`, el nuevo frontend no los solicita. Eliminarlos también retira los binarios de la publicación y reduce su tamaño.

4. Registra y publica los cambios:

```bash
git add -A
git commit -m "Graba MP4 nativo y descarga sin cargar librerías de conversión"
git push origin main
```

5. En **Settings → Pages**, selecciona **GitHub Actions**. Espera el workflow de despliegue y abre <https://svn11x.github.io/screencribe/> con una recarga completa.

## Verificación después de publicar

- Antes de grabar, lee el aviso de formato bajo las opciones de audio.
- Graba una pestaña o ventana; prueba pausa/reanudación y detén la captura.
- El botón debe mostrar **Descargar MP4** si el navegador grabó MP4, o el formato alternativo real, como **Descargar WEBM**.
- Descargar no debe iniciar «Conversión», cargar un motor ni mostrar una barra de conversión.
- Con «Guardar audio aparte» y una fuente con audio, se habilita una segunda descarga en su formato nativo.
- Si revisas Network de DevTools, no debe haber solicitudes a `assets/vendor/`, FFmpeg, `.wasm` ni CDN. Sí se cargan los módulos propios del sitio y su worker de captura.

## Cambios de funcionalidad

No se convierte WebM a MP4 ni se transcodifican archivos cargados. Para MP4 directo hace falta soporte nativo en el navegador/equipo. La conversión general a MP3 queda desactivada; las nuevas grabaciones pueden guardar audio separado sin librerías. Un MP3 ya existente conserva su formato.

La descarga usa el archivo preparado en memoria. Para archivos grandes aún puede haber tiempo de finalización o escritura en disco, aunque ya no se descarga un motor ni se recodifica el video.
