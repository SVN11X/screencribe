# Seguridad

No publiques contraseñas, tokens de Hugging Face ni otras credenciales dentro del código.
Usa `Settings → Secrets and variables → Actions` para `HF_TOKEN`.

El backend aplica límite por dirección IP, tamaño máximo de carga, orígenes CORS configurables y eliminación temporal. Para una aplicación pública con alto tráfico se recomienda añadir autenticación, almacenamiento de objetos y una cola persistente.

Reporta vulnerabilidades de forma privada al propietario del repositorio.
