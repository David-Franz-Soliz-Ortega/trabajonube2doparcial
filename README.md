# Catálogo de Libros API

API REST para la gestión de un catálogo de libros desarrollada con Node.js y Express, desplegada en Amazon EC2 con Nginx como proxy inverso y respaldada por Amazon RDS con MariaDB. Incluye pipelines de CI/CD automatizados con GitHub Actions y contenedorización con Docker.

---

## 1. Recursos de AWS Utilizados

- **VPC:** VPC por defecto en la región `us-east-1`.
- **Amazon EC2:**
  - Instancia Linux (Ubuntu Server 22.04 LTS, tipo `t2.micro`).
  - Nombre / Identificador: `ec2-davidfranz`.
  - IP Pública asignada automáticamente.
- **Amazon RDS:**
  - Motor: MariaDB (versión 10.11 / Capa gratuita).
  - Instancia: `db.t3.micro`.
  - Identificador de instancia: `db-davidfranz`.
  - Base de datos inicial: `biblioteca`.
  - Acceso público: **Deshabilitado** (acceso exclusivamente interno desde la VPC).
- **Grupos de Seguridad (Security Groups):**
  - `sg-ec2-davidfranz`:
    - SSH (Puerto 22): Autorizado para administración y para el runner de GitHub Actions.
    - HTTP (Puerto 80): Autorizado desde cualquier origen IPv4 (`0.0.0.0/0`).
  - `sg-rds-davidfranz`:
    - MariaDB/MySQL (Puerto 3306): Autorizado únicamente desde el identificador del grupo de seguridad de EC2 (`sg-ec2-davidfranz`).
  - Los puertos 3000 y 3306 se encuentran estrictamente bloqueados hacia Internet.

---

## 2. Configuración Previa de la Infraestructura y Secretos

### 2.1 Preparación de la Base de Datos en RDS

Desde la instancia EC2, conéctate a la instancia RDS para crear la base de datos y la tabla:

```bash
mariadb -h <ENDPOINT_RDS> -u admin -p --ssl=FALSE
```

Dentro de la consola de MariaDB, ejecuta:

```sql
CREATE DATABASE IF NOT EXISTS biblioteca;
USE biblioteca;

CREATE TABLE IF NOT EXISTS libros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    autor VARCHAR(255) NOT NULL,
    anio_publicacion INT NOT NULL
);

EXIT;
```

### 2.2 Preparación de Docker y Variables de Entorno en EC2

En la instancia EC2, instala Docker y asegura los permisos para el usuario:

```bash
sudo apt update
sudo apt install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
```

Crea el archivo de credenciales en `/home/ubuntu/.env` para mantener las credenciales fuera del repositorio:

```bash
nano /home/ubuntu/.env
```

Contenido:
```env
PORT=3000
DB_HOST=<ENDPOINT_RDS>
DB_USER=admin
DB_PASSWORD=<PASSWORD_RDS>
DB_NAME=biblioteca
DB_PORT=3306
```

### 2.3 Configuración de Nginx (Proxy Inverso)

Nginx redirige el tráfico entrante del puerto público 80 al puerto interno `127.0.0.1:3000` donde atiende el contenedor Docker:

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Para habilitar y aplicar la configuración:
```bash
sudo ln -s /etc/nginx/sites-available/api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 2.4 Secrets de GitHub Actions

En el repositorio de GitHub (**Settings > Secrets and variables > Actions**), configura los siguientes secretos:

| Secret | Descripción |
| :--- | :--- |
| `DOCKER_USERNAME` | Usuario en Docker Hub |
| `DOCKER_PASSWORD` | Contraseña o Personal Access Token de Docker Hub |
| `EC2_HOST` | Dirección IP pública de la instancia EC2 |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contenido íntegro de la clave privada SSH (`.pem`) |

---

## 3. Pruebas Automatizadas (CI)

La suite de pruebas automatizadas está implementada con **Jest** y **Supertest** en el archivo `app.test.js`. Utiliza un mock de la base de datos para ejecutarse de forma aislada sin requerir RDS:

- `GET /health`: Comprueba código 200 y presencia del campo `version`.
- `POST /libros`: Valida creación correcta (código 201).
- `POST /libros`: Valida rechazo de datos inválidos como título vacío o año incorrecto (código 400).
- `GET /libros/:id`: Valida respuesta adecuada ante recursos inexistentes (código 404).

Para correr las pruebas localmente:
```bash
npm test
```

---

## 4. Pipeline de CI/CD (GitHub Actions)

### 4.1 Integración Continua (`ci.yml`)
- Se dispara automáticamente ante cualquier `push` y `pull_request` sobre `main` o `master`.
- Ejecuta `npm ci` y `npm test`. Si alguna prueba falla, cancela el pipeline.

### 4.2 Despliegue Continuo (`cd.yml`)
- Se dispara **únicamente** ante eventos de `push` directos o merges a la rama principal (los pull requests no despliegan).
- Se estructura en tres etapas dependientes secuenciales:
  1. **test:** Ejecuta la suite de pruebas unitarias.
  2. **build-and-push:** Compila la imagen Docker, la etiqueta con el commit SHA (`${{ github.sha }}`) y la sube al registro Docker Hub.
  3. **deploy:** Conexión SSH a EC2, descarga la imagen identificada por el SHA, despliega el contenedor mapeado a `127.0.0.1:3000` consumiendo `/home/ubuntu/.env`, y verifica la salud de los endpoints `/health` y `/libros`. En caso de fallo en la verificación, ejecuta un rollback automático al contenedor previo.

---

## 5. Guía de Pruebas: Cómo Demostrar que el CI/CD Funciona

Para evidenciar ante evaluación que todo el ciclo automatizado opera correctamente, sigue estos pasos:

### 5.1 Demostración de CI en Pull Request (Sin Despliegue)
1. Crea una rama secundaria:
   ```bash
   git checkout -b feature/test-ci
   ```
2. Realiza un cambio en el código y sube la rama a GitHub:
   ```bash
   git push origin feature/test-ci
   ```
3. Abre un **Pull Request** hacia `main`:
   - Observa en la pestaña **Actions** que únicamente se ejecuta el workflow **CI Pipeline**.
   - El workflow **CD Pipeline** **no** se activa, cumpliendo la restricción de que los pull requests no despliegan.

### 5.2 Demostración de Despliegue Exitoso (Cambio Visible de Versión)
1. Modifica la versión visible en el archivo `app.js` (por ejemplo, cambia `'1.0.0'` por `'1.1.0'`) y actualiza `version` en `package.json` a `"1.1.0"`.
2. Confirma y sube los cambios a la rama principal:
   ```bash
   git checkout main
   git merge feature/test-ci
   git commit -am "chore: bump version to 1.1.0"
   git push origin main
   ```
3. Dirígete a la pestaña **Actions** en GitHub:
   - Verás que el workflow **CD Pipeline** arranca automáticamente.
   - Pasan las tres fases: `test` -> `build-and-push` -> `deploy`.
   - La fase de verificación post-despliegue en el step SSH responde con éxito.
4. Comprueba desde tu terminal local el cambio visible consumiendo la IP pública de tu EC2:
   ```bash
   curl -i -X GET http://<IP_PUBLICA_EC2>/health
   ```
   **Respuesta esperada:**
   ```json
   {
     "status": "active",
     "version": "1.1.0",
     "message": "Servicio activo"
   }
   ```
   *El cambio de versión confirma que el nuevo contenedor construido a partir del SHA del commit fue desplegado en EC2.*

### 5.3 Demostración de Verificación de Endpoints y Persistencia en RDS
Ejecuta desde tu máquina local las pruebas de catálogo:

1. **Creación de libro (POST):**
   ```bash
   curl -i -X POST http://<IP_PUBLICA_EC2>/libros \
     -H "Content-Type: application/json" \
     -d '{"titulo": "Cien anos de soledad", "autor": "Gabriel Garcia Marquez", "anio_publicacion": 1967}'
   ```
   - Código `201 Created`.

2. **Consulta de libros (GET):**
   ```bash
   curl -i -X GET http://<IP_PUBLICA_EC2>/libros
   ```
   - Código `200 OK` retornando el array con el registro.

3. **Demostración de persistencia directa en MariaDB:**
   Conéctate a la instancia RDS desde la terminal de EC2 para verificar que los datos están almacenados en la base de datos administrada y no en el contenedor:
   ```bash
   mariadb -h <ENDPOINT_RDS> -u admin -p biblioteca --ssl=FALSE -e "SELECT * FROM libros;"
   ```

### 5.4 Demostración de Resiliencia y Rollback Automático ante Fallos
Para demostrar que el despliegue falla y mantiene la versión anterior si no supera las comprobaciones:
1. Introduce una prueba que falle intencionalmente o un error en la ruta `/health`.
2. Sube el commit a `main`.
3. Observa en GitHub Actions:
   - Si la prueba falla en la etapa `test`, el workflow termina inmediatamente en estado rojo y **no** compila ni despliega.
   - Si se simula un fallo en la respuesta de los endpoints durante el despliegue, el script de despliegue detecta el código HTTP distinto a `200`, cancela el nuevo contenedor, restaura el contenedor previo (`api-libros-rollback`) y finaliza con código de error, preservando la disponibilidad del servicio.
