# Ruta Praxis
URL PAG:https://ruta-praxis.onrender.com

Aplicacion web para apoyar el seguimiento de practicas academicas entre estudiantes, docentes y administradores.

## Base de datos y backend

El backend usa Node.js, Express y Mongoose. MongoDB almacena los datos en la base `ruta_praxis`; no se cargan usuarios ni registros de ejemplo. Las colecciones se crean automaticamente al guardar el primer documento de cada tipo.

### Iniciar en Windows

1. Instala y ejecuta MongoDB Community Server en tu computador, o crea un cluster de MongoDB Atlas.
2. En una terminal, desde la carpeta raiz del proyecto, instala las dependencias:

   ```powershell
   npm install
   ```

3. Crea el archivo de configuracion local:

   ```powershell
   Copy-Item backend\.env.example .env
   ```

4. Si usas MongoDB local, puedes dejar `MONGODB_URI=mongodb://127.0.0.1:27017/ruta_praxis`. Para Atlas, reemplaza esa URI en `.env` por la cadena de conexion de tu cluster. No compartas ni subas `.env`.
5. Arranca la aplicacion:

   ```powershell
   npm start
   ```

6. Abre `http://127.0.0.1:3000`. La API de comprobacion esta en `http://127.0.0.1:3000/api/health`.

MongoDB Compass o la extension MongoDB de VS Code pueden conectarse a `mongodb://127.0.0.1:27017`. La base y sus colecciones apareceran despues de guardar el primer registro.

## Modelo de datos

- `users`: datos personales y rol (`administrador`, `director`, `docente`, `asesor`, `estudiante`).
- `institutions`: entidades donde se realizan las practicas.
- `practicetypes`: tipos de practica, semestre y horas requeridas.
- `practiceassignments`: asigna un tipo de practica a un estudiante, docente responsable e institucion; puede incluir otra persona responsable del acompanamiento.
- `activities`: instrucciones publicadas por el docente para una asignacion.
- `submissions`: respuesta y referencias a evidencias entregadas por el estudiante.
- `observations`: observaciones de seguimiento realizadas por un docente.
- `evaluations`: calificacion y retroalimentacion del docente.
- `practicelogs`: horas y actividades registradas para dar seguimiento a la practica.

Los documentos relacionados se vinculan mediante referencias `ObjectId`. Los archivos adjuntos se representan por metadatos y URL; la carga real de archivos requiere agregar un servicio de almacenamiento.

## Roles y seguimiento academico

El **Administrador** es un rol de soporte de la plataforma: crea y mantiene las cuentas de usuario y la configuracion academica. No reemplaza a los actores que realizan el seguimiento academico descritos en el proyecto. Los roles operativos habilitados son estudiante, docente, asesor y director; el Coordinador no se implementa en esta version.

Las practicas nuevas quedan pendientes de aprobacion del Director asignado al programa del estudiante. El docente puede publicar actividades y evaluaciones cuando la practica esta aprobada; los estudiantes pueden entregar respuestas y enlaces de evidencia, y registrar horas en su bitacora. Docentes y asesores autorizados pueden revisar las entregas, registrar observaciones y validar horas. Cada panel obtiene los datos del usuario autenticado mediante `/api/workflow/dashboard`, con permisos comprobados en el servidor.

El panel del Director y los indicadores administrativos se calculan a partir de registros de MongoDB, no de cifras de demostracion. Las evidencias se guardan como enlaces HTTP/HTTPS y metadatos; la carga binaria de archivos aun requiere un servicio de almacenamiento. Las notificaciones push, agenda de visitas y rúbricas configurables tambien quedan fuera del alcance implementado.

## API inicial

Todas las rutas usan JSON y tienen operaciones `GET` (lista y por ID), `POST`, `PATCH` y `DELETE`:

| Recurso | Ruta |
| --- | --- |
| Usuarios | `/api/users` |
| Programas académicos | `/api/programs` |
| Asignaturas | `/api/subjects` |
| Instituciones | `/api/institutions` |
| Tipos de practica | `/api/practiceTypes` |
| Asignaciones de practica | `/api/assignments` |
| Actividades | `/api/activities` |
| Entregas y evidencias | `/api/submissions` |
| Observaciones | `/api/observations` |
| Evaluaciones | `/api/evaluations` |
| Seguimiento de horas | `/api/practiceLogs` |
| Estudiantes asignados al docente autenticado | `/api/teacher/students` |
| Resumen y registros académicos según rol | `/api/workflow/dashboard` |
| Crear actividades, entregas, bitácoras, observaciones y evaluaciones | `/api/workflow/*` |
| Decisión de aprobación del Director | `/api/workflow/assignments/:id/approval` |
| Indicadores del Administrador | `/api/admin/summary` |

Ejemplo para crear un usuario:

```json
{
  "firstName": "Nombre",
  "lastName": "Apellido",
  "email": "persona@institucion.edu.co",
  "role": "estudiante",
  "studentCode": "CODIGO-001"
}
```

Abre `http://127.0.0.1:3000`. Si todavía no existe un administrador, aparecerá un formulario de configuración inicial; crea su nombre de usuario sin `@` y una contraseña de al menos 10 caracteres. Después inicia sesión con ese usuario. Para los roles académicos se exige un correo electrónico válido. El panel de administración permite listar, crear, editar, activar, desactivar y eliminar usuarios; cada cuenta nueva debe tener contraseña. Las contraseñas se guardan con bcrypt y la sesión viaja en una cookie `HttpOnly`.

Los perfiles de administrador, director, docente, asesor y estudiante muestran el nombre real de la cuenta y permiten guardar correo personal, teléfono y una foto JPG, PNG o WEBP de hasta 5 MB en MongoDB. Si no hay foto, se muestran las iniciales del nombre. El botón de notificaciones del panel de administración informa cuando no hay novedades pendientes.

En el panel administrador, usa **Programas académicos** para registrar cada nombre y, si ya existe una cuenta con rol Director, asignarla como responsable. El director puede quedar sin asignar y añadirse después al editar el programa. En **Gestionar usuarios** se pueden crear estudiantes, asesores, directores y docentes; cada usuario elige un programa activo y una o varias asignaturas registradas. Los cuatro roles acceden a sus paneles al iniciar sesión.

El inicio del administrador incluye una lista de configuración inicial y un historial persistente de altas, cambios, activaciones, desactivaciones y eliminaciones hechos desde las rutas de administración. La tabla de usuarios permite buscar, filtrar por estado, rol y programa, recorrer páginas de diez cuentas y exportar los resultados filtrados a CSV.

El código de usuario se genera automáticamente en el backend con un contador atómico y se protege con un índice único en MongoDB. Las asignaturas se gestionan por separado en **Gestionar asignaturas**.

Desde el panel también puedes asignar docentes a programas, docentes y estudiantes a asignaturas, y estudiante, docente y asesor a cada práctica. Cada docente puede tener estudiantes en varias asignaturas y semestres; las asignaciones se guardan en MongoDB y se conservan al editar. El panel docente consulta su lista de estudiantes a partir de las materias asignadas. El inicio del administrador muestra contadores de usuarios, asignaturas, instituciones y prácticas en curso leídos de la API. El acceso muestra los cinco perfiles disponibles: administrador, director, docente, asesor y estudiante.

Los formularios de programas, asignaturas, instituciones y prácticas se guardan en MongoDB desde el panel administrador. Al crear una práctica se puede escribir un tipo nuevo o elegir uno existente; no se crean tipos de muestra automáticamente. Las rutas de administración están restringidas al administrador y la ruta de estudiantes del docente solo permite consultar sus propias asignaciones.

## Alcance y seguridad

El backend y los formularios administrativos principales usan MongoDB. Las demás herramientas de seguimiento académico deben validarse y conectarse a sus endpoints antes de desplegar el sistema. El servidor escucha en `127.0.0.1` y está pensado para desarrollo local. La carga real de archivos requiere un servicio de almacenamiento antes de exponerlo a una red.

## Publicar en Render

El archivo `render.yaml` configura un servicio web Node.js para servir la web y el backend en el mismo dominio. En Render, crea un **Blueprint** a partir del repositorio de GitHub y define `MONGODB_URI` como una variable secreta con la cadena de conexión de MongoDB Atlas. `JWT_SECRET` se genera automáticamente. En Atlas, autoriza las conexiones entrantes del servicio Render según la política de red que elijas; evita publicar credenciales o la URI en el repositorio.

Tras completar el despliegue, Render proporciona una dirección pública `https://...onrender.com` que se puede guardar como marcador o acceso directo. En el plan gratuito el servicio puede suspenderse tras un periodo sin tráfico y tardar unos momentos en responder a la primera visita; el plan `free` en `render.yaml` puede cambiarse desde Render si se necesita un servicio siempre activo.

Los registros de administración se leen desde MongoDB y no se restauran desde el almacenamiento local del navegador; así se evitan datos de demostración o antiguos que no estén en la base de datos. El estado local anterior del prototipo no se migra automáticamente.
