# IA local con Whisper Large v3

## Modelo

La aplicación usa el modelo ONNX `onnx-community/whisper-large-v3-ONNX`, derivado de Whisper Large v3 y compatible con Transformers.js.

Para hacerlo más viable en un navegador se seleccionan pesos cuantizados a 4 bits para el encoder y el decoder. Sigue siendo la arquitectura Large v3, pero la cuantización puede modificar ligeramente sus resultados.

## Por qué WebGPU es obligatorio

Whisper Large contiene muchos parámetros y resulta poco práctico en CPU dentro de un navegador. WebGPU permite ejecutar las operaciones del modelo en una GPU compatible. La aplicación bloquea la transcripción cuando WebGPU no está disponible, en lugar de iniciar una operación que probablemente no terminaría.

## Primera ejecución

Al pulsar **Preparar Whisper Large**:

1. Transformers.js descarga configuración, tokenizador y pesos ONNX desde Hugging Face.
2. El navegador guarda los recursos en caché cuando es posible.
3. ONNX Runtime Web crea las sesiones WebGPU.
4. La interfaz confirma que el modelo está listo.

No existe API key ni consumo por minuto.

## Precisión

Para mejorar el resultado:

- Selecciona el idioma en lugar de usar detección automática cuando lo conozcas.
- Usa un micrófono cercano y evita saturación.
- Reduce ruido, música de fondo y conversaciones simultáneas.
- Revisa nombres, números, siglas y palabras técnicas.
- Exporta SRT o VTT para corregir conservando las marcas de tiempo.

## Cancelación

La inferencia en curso no siempre puede interrumpirse dentro de una operación WebGPU. Al cancelar, la aplicación termina el Web Worker completo. Los archivos ya descargados suelen permanecer en la caché, pero el modelo deberá inicializarse nuevamente.
