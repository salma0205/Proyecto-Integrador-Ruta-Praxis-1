# Ruta Praxis

Aplicacion web para apoyar el seguimiento de practicas academicas entre estudiantes, docentes, asesores, directores y administradores.

## Alcance del MVP actual

El proyecto actual se enfoca en un MVP funcional para los siguientes roles:

- Administrador
- Estudiante
- Docente
- Asesor
- Director

Dentro del alcance implementado quedan:

- gestion de usuarios, programas, asignaturas, instituciones y tipos de practica
- asignacion y aprobacion de practicas
- creacion de actividades docentes
- entregas de estudiantes con evidencias por URL
- revisiones, observaciones, horas y evaluaciones
- seguimiento de prácticas y consulta de evidencias asignadas
- informes CSV descargables para el Director
- dashboard y indicadores por rol
- historial de auditoria administrativa

Fuera del alcance del MVP actual quedan:

- Coordinador
- agenda avanzada de visitas y asistencia programada
- almacenamiento externo para archivos grandes
- rubricas configurables avanzadas
- notificaciones push
- agenda de visitas institucionales
- reportes PDF o exportación avanzada

Esto se documenta de forma explicita para evitar confundir el alcance real de la entrega final con los requisitos extendidos del proyecto conceptual.

## Base de datos y backend

El backend usa Node.js, Express y `node-oracledb` en modo Thin para conectarse a Oracle Database 12.1 o posterior (se recomienda Oracle XE 18c/21c o Oracle Database Free). Oracle XE 10g no es compatible. No se cargan usuarios ni registros de ejemplo y no se migran datos de Atlas: la base Oracle inicia vacía.

### Iniciar en Windows

1. Asegúrate de que OracleServiceXE y OracleXETNSListener estén iniciados.
2. Conéctate al servicio PDB de XE en SQL*Plus como administrador. SQL*Plus te pedirá la contraseña sin guardarla en el repositorio:

   ```powershell
   sqlplus system@localhost:1521/XEPDB1
   ```

   Sustituye `CLAVE_ELEGIDA_LOCALMENTE` por una contraseña elegida en tu equipo y crea el usuario propietario del esquema:

   ```sql
   CREATE USER RUTA_PRAXIS IDENTIFIED BY "CLAVE_ELEGIDA_LOCALMENTE";
   GRANT CREATE SESSION, CREATE TABLE TO RUTA_PRAXIS;
   ALTER USER RUTA_PRAXIS QUOTA UNLIMITED ON USERS;
   ```

3. En una terminal, desde la carpeta raiz del proyecto, instala las dependencias:

   ```powershell
   npm install
   ```

4. Crea el archivo de configuracion local:

   ```powershell
   Copy-Item backend\.env.example .env
   ```

5. Escribe la contraseña del propietario en `ORACLE_PASSWORD` dentro de `.env`. El valor predeterminado de `ORACLE_CONNECT_STRING` es `localhost:1521/XEPDB1`; cámbialo solo si tu servicio local usa otra dirección. No compartas ni subas `.env`.
7. Conéctate a SQL*Plus como `RUTA_PRAXIS`:

   ```powershell
   sqlplus RUTA_PRAXIS@localhost:1521/XEPDB1
   ```

   Luego ejecuta el esquema desde la raíz del proyecto:

   ```sql
   @database\oracle\schema.sql
   ```

8. Arranca la aplicacion:

   ```powershell
   npm start
   ```

9. Abre `http://127.0.0.1:3000`. La API de comprobacion esta en `http://127.0.0.1:3000/api/health`.

El endpoint `/api/health` indica si el proceso tiene un pool Oracle inicializado. No se crea ninguna cuenta automáticamente: abre el sitio para configurar el primer administrador.

Si ya habías ejecutado el esquema antes de esta versión, conéctate como `RUTA_PRAXIS` y ejecuta una sola vez `@database\oracle\migrations\001_practice_programs.sql`. La migración conserva el programa de las prácticas existentes a partir del programa de sus estudiantes y luego quita el programa de las cuentas que no sean Director. En instalaciones nuevas, basta con ejecutar `schema.sql`; no ejecutes la migración.

Para una base ya creada, ejecuta también una sola vez `@database\oracle\migrations\002_assignment_required_hours.sql` para guardar las horas requeridas por cada práctica. Las instalaciones nuevas ya incluyen esa columna en `schema.sql`.

Ejecuta una sola vez `@database\oracle\migrations\003_student_program_assignments.sql` en bases existentes para permitir la asignación del programa académico a estudiantes. Después, asígnales su programa y sus asignaturas desde **Gestionar usuarios**. Las instalaciones nuevas ya incluyen esta regla en `schema.sql`.

Ejecuta una sola vez `@database\oracle\migrations\004_student_staff_assignments.sql` en bases existentes, después de las migraciones 001, 002 y 003. Esta migración habilita varios Directores por programa, las asignaciones directas de docentes y Director a cada estudiante y los docentes de cada práctica. Después, revisa y completa las asignaciones desde **Gestionar usuarios**. Las instalaciones nuevas ya incluyen estas tablas en `schema.sql`.

Ejecuta una sola vez `@database\oracle\migrations\005_activity_resources.sql` en bases existentes, después de la migración 004. Esta migración crea el almacenamiento Oracle de archivos adjuntos a actividades. Las instalaciones nuevas ya incluyen esta tabla en `schema.sql`.

Ejecuta una sola vez `@database\oracle\migrations\006_student_workflows.sql` en bases existentes, después de la migración 005. Habilita actividades evaluativas, carga de archivos en entregas y evidencias directas de prácticas. Las instalaciones nuevas ya incluyen estos cambios en `schema.sql`.

En el panel del estudiante, **Mis actividades** muestra las actividades regulares, **Ver evidencias** reúne responsables, bitácora de horas, evidencias de práctica y entregas, y **Evaluaciones** muestra las evaluaciones publicadas por el docente que el estudiante debe responder. Las entregas y evidencias aceptan enlaces y hasta 5 archivos de 20 MB en total.

## Modelo de datos

- `users`: datos personales y rol (`administrador`, `director`, `docente`, `asesor`, `estudiante`).
- `academic_subjects`: asignaturas identificadas por nombre y semestre; los códigos se generan internamente.
- `institutions`: entidades de Bucaramanga vinculadas a un semestre entre 8 y 10.
- `practicetypes`: tipos de practica, semestre y horas requeridas.
- `practiceassignments`: asigna un tipo de practica a un estudiante, sus docentes responsables e institucion, con sus horas requeridas; puede incluir un asesor.
- `program_directors` y `student_teachers`: relacionan programas y estudiantes con sus responsables académicos. `student_directors` se conserva por compatibilidad con datos previos, pero el Director ve estudiantes que comparten su programa y semestre.
- `activities`: actividades regulares o evaluaciones publicadas por el docente para una asignatura o práctica.
- `submissions`: respuesta y referencias a evidencias entregadas por el estudiante.
- `practice_evidences`: enlaces y archivos vinculados directamente a una práctica.
- `observations`: observaciones de seguimiento realizadas por un docente.
- `evaluations`: calificacion y retroalimentacion del docente.
- `practicelogs`: horas y actividades registradas para dar seguimiento a la practica.
- `practicevisits`: visitas de seguimiento documentadas por el docente/tutor para una práctica.
- `attendancevalidations`: asistencia y valoración del desempeño del estudiante registradas por el asesor.

Los registros relacionados se vinculan mediante identificadores UUID en Oracle. Las actividades aceptan enlaces HTTP/HTTPS y hasta 5 archivos de apoyo (incluidos documentos, imágenes y videos) con un máximo combinado de 20 MB. Para videos más grandes, utiliza un enlace compartido con permisos de acceso. Las evidencias que entrega el estudiante pueden ser enlaces HTTP/HTTPS o archivos de hasta 20 MB en total por envío.

## Roles y seguimiento academico

El **Administrador** es un rol de soporte de la plataforma: crea y mantiene las cuentas de usuario y la configuracion academica. No reemplaza a los actores que realizan el seguimiento academico descritos en el proyecto. Los roles operativos habilitados son estudiante, docente, asesor y director; el Coordinador no se implementa en esta version.

El Administrador registra instituciones con nombre, dirección en Bucaramanga y un semestre entre 8 y 10. El Director ve estudiantes activos que comparten su programa y semestre, y gestiona prácticas solo para estudiantes de semestres 8, 9 y 10 que coincidan con su propio semestre, asignando docente, asesor, institución, fechas y horas requeridas; la institución debe corresponder al semestre del estudiante. El asesor seleccionado por el Director es quien verá al estudiante y sus evidencias en el panel de asesor. Las prácticas nuevas quedan pendientes de aprobación del Director asignado al programa. El docente puede publicar actividades regulares y evaluaciones pendientes para el estudiante; ambas admiten enlaces y archivos de apoyo. Los estudiantes pueden entregar sus respuestas con enlaces o archivos y registrar horas y evidencias directas de la práctica. Las entregas se consultan desde **Evidencias** en los paneles de Docente y Asesor. Docentes y asesores autorizados pueden validar horas. Cada panel obtiene los datos del usuario autenticado mediante `/api/workflow/dashboard`, con permisos comprobados en el servidor.

Las asignaturas se registran únicamente con nombre y semestre. Desde **Gestionar usuarios**, cada Director tiene un programa académico y un semestre; en su consulta aparecen automáticamente los estudiantes activos que comparten ambos. Cada Estudiante tiene programa, semestre, una o más asignaturas de ese semestre y varios Docentes responsables. Los Docentes pueden tener asignaturas de varios semestres. Solo se pueden crear prácticas para estudiantes de semestres 8 a 10 que compartan programa y semestre con el Director; este elige a uno de ellos y le asigna un Asesor. Los estudiantes de semestres 1 a 7 no requieren práctica ni asesor. Al crear la práctica, se vinculan automáticamente todos los docentes asignados al estudiante.

El panel del Director y los indicadores administrativos se calculan a partir de registros Oracle, no de cifras de demostracion. Los archivos adjuntos de las actividades se guardan en Oracle; las evidencias del estudiante pueden compartirse mediante enlaces HTTP/HTTPS. Las notificaciones push, la agenda avanzada de visitas y las rúbricas configurables tambien quedan fuera del alcance implementado.

En bases existentes, ejecuta una sola vez `@database\oracle\migrations\007_advisor_evidence_requests.sql` después de la migración 006. Habilita las solicitudes de evidencia del Asesor, las entregas de archivos o enlaces y las horas asociadas. Las instalaciones nuevas ya incluyen estas tablas en `schema.sql`.

En **Ver evidencias**, el estudiante solo ve solicitudes creadas por su Asesor. Cada entrega incluye archivos o un enlace, fecha, actividad y horas; el Asesor puede aprobarla o pedir cambios.

### Prueba manual del flujo principal

Con cuentas de prueba, recorre el proceso en este orden:

1. Crea un programa y registra un Director asignándole ese programa desde **Gestionar usuarios**.
2. Registra una asignatura con su nombre y semestre.
3. Crea un Estudiante con ese programa, un Docente y un Asesor. Elige un estudiante de semestre 8 a 10 para la práctica; asigna uno o más docentes y asignaturas del mismo semestre desde **Gestionar usuarios**.
4. Registra una institución en Bucaramanga y vincúlala al semestre del estudiante.
5. Entra como Director y crea la práctica para ese estudiante, con Asesor, institución, fechas y horas requeridas; luego apruébala. Los docentes se asignan automáticamente.
6. Entra como Docente y publica una actividad con un enlace o un archivo de apoyo.
7. Entra como Estudiante, entrega la actividad con un enlace compartido de Drive y registra horas.
8. Entra como Docente y revisa la entrega desde **Evidencias**; luego como Docente o Asesor para validar las horas.
9. Entra como Asesor y confirma que solo aparezcan los estudiantes y evidencias asignados por el Director.
10. Entra como Director, consulta el informe y descarga el CSV.

La suite automatizada valida modelos y reglas locales, pero este flujo debe repetirse con una base y cuentas de prueba antes de la demostración final.

## API inicial

Estas son las rutas principales de la API. Las operaciones disponibles dependen del recurso y del rol; las acciones de flujo de trabajo se validan en rutas específicas:

| Recurso | Ruta |
| --- | --- |
| Usuarios | `/api/users` |
| Programas académicos | `/api/programs` |
| Asignaturas | `/api/subjects` |
| Instituciones | `/api/institutions` |
| Tipos de practica | `/api/practiceTypes` |
| Gestionar asignaciones de práctica (Director) | `/api/workflow/assignments` |
| Actividades | `/api/activities` |
| Entregas y evidencias | `/api/submissions` |
| Observaciones | `/api/observations` |
| Evaluaciones | `/api/evaluations` |
| Seguimiento de horas | `/api/practiceLogs` |
| Estudiantes asignados al docente autenticado | `/api/teacher/students` |
| Resumen y registros académicos según rol | `/api/workflow/dashboard` |
| Crear actividades, entregas, bitácoras, observaciones y evaluaciones | `/api/workflow/*` |
| Registrar visitas del Tutor Académico | `POST /api/workflow/visits` |
| Registrar asistencia y desempeño del Asesor Pedagógico | `POST /api/workflow/attendance` |
| Decisión de aprobación del Director | `/api/workflow/assignments/:id/approval` |
| Consultar o descargar el informe CSV del Director | `/api/workflow/reports` y `/api/workflow/reports.csv` |
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

Abre `http://127.0.0.1:3000`. Si todavía no existe un administrador, aparecerá un formulario de configuración inicial; crea su nombre de usuario sin `@` y una contraseña de 1 a 10 caracteres. Después inicia sesión con ese usuario. Para los roles académicos se exige un correo electrónico válido. El panel de administración permite listar, crear, editar, activar, desactivar y eliminar usuarios; cada cuenta nueva debe tener contraseña. Las contraseñas se guardan con bcrypt y la sesión viaja en una cookie `HttpOnly`.

Si olvidaste la contraseña del único administrador, desde la raíz del proyecto ejecuta `npm run reset-admin-password` en PowerShell. La herramienta usa la conexión Oracle configurada en `.env`, muestra los nombres de las cuentas administradoras y actualiza solo la cuenta que confirmes. La nueva contraseña debe tener de 1 a 10 caracteres; se escribe de forma oculta y no se puede recuperar la anterior. No compartas el archivo `.env`.

En el inicio de sesión está la opción **¿Olvidaste tu usuario o contraseña?**. La persona envía su nombre, correo de contacto, dato de cuenta si lo recuerda y el tipo de ayuda que solicita. El administrador recibe la solicitud en **Solicitudes de acceso** y en el contador de notificaciones del panel. El sistema no revela ni puede recuperar la contraseña anterior, y no envía correos automáticamente: el administrador debe verificar la identidad y comunicar el acceso por un canal institucional.

Los perfiles de administrador, director, docente, asesor y estudiante muestran el nombre real de la cuenta y permiten guardar correo personal, teléfono y una foto JPG, PNG o WEBP de hasta 5 MB en Oracle. Si no hay foto, se muestran las iniciales del nombre.

En el panel administrador, usa **Programas académicos** para registrar el nombre de cada programa. En **Gestionar usuarios**, asigna un programa a Directores y Estudiantes, y semestre, asignaturas y docentes a los Estudiantes. El Director verá automáticamente a los estudiantes de su programa; al registrar prácticas para estudiantes de semestres 8 a 10, también les asigna un Asesor.

El inicio del administrador incluye una lista de configuración inicial y un historial persistente de altas, cambios, activaciones, desactivaciones y eliminaciones hechos desde las rutas de administración. La tabla de usuarios permite buscar, filtrar por estado, rol y programa, recorrer páginas de diez cuentas y exportar los resultados filtrados a CSV.

El código de usuario se genera automáticamente en el backend y se protege con una restricción única en Oracle. Las asignaturas se gestionan por separado en **Gestionar asignaturas**.

Desde el panel también puedes asignar docentes y estudiantes a asignaturas y docentes a Estudiantes. Cada docente puede tener asignaturas de varios semestres; las asignaciones se guardan en Oracle y se conservan al editar. El panel docente consulta su lista de estudiantes asignados. El inicio del administrador muestra contadores de usuarios, asignaturas, instituciones y prácticas en curso leídos de la API. El acceso muestra los cinco perfiles disponibles: administrador, director, docente, asesor y estudiante.

Los formularios de programas, asignaturas, instituciones y prácticas se guardan en Oracle desde el panel administrador. Al crear una práctica se puede escribir un tipo nuevo o elegir uno existente; no se crean tipos de muestra automáticamente. Las rutas de administración están restringidas al administrador y la ruta de estudiantes del docente solo permite consultar sus propias asignaciones.

## Alcance y seguridad

El backend y los formularios administrativos principales usan Oracle Database XE local. El sistema cumple con la base funcional del proyecto para el seguimiento de practicas academicas en los roles definidos en el MVP. Las funcionalidades que quedaron fuera del alcance se consideran ampliaciones futuras y no forman parte de la entrega actual.

El servidor escucha en `127.0.0.1` y está pensado para desarrollo local. Antes de exponerlo a una red, configura un Oracle accesible de forma segura; los archivos de apoyo se guardan en la base y los videos grandes deben compartirse mediante un enlace.

## Entregables recomendados para la defensa

Para cerrar el proyecto académico, se recomienda entregar al menos lo siguiente:

- diagrama de casos de uso
- diagrama de clases / dominio
- modelo entidad-relacion y modelo relacional
- diccionario de datos
- prototipo de alta fidelidad
- evidencia de CRUD de tablas principales
- pruebas de flujo principal del sistema
- manual de usuario
- manual tecnico
- video de funcionamiento
- articulo final en formato IEEE o equivalente

## Estado actual del proyecto

El proyecto ya tiene una base funcional valida para el seguimiento de practicas academicas con roles diferenciados por permisos. La parte central del negocio queda resuelta para la gestion operativa de practicas, actividades, entregas, horas, observaciones y evaluaciones.

El trabajo pendiente más importante es cerrar la documentacion academica y dejar definido de forma clara el alcance real de la entrega final.

## Publicar en Render

Oracle XE configurado en `localhost` es una base local y no es accesible desde Render. El despliegue no está habilitado hasta que se configure una instancia Oracle remota accesible de forma segura; no expongas directamente el servicio local ni publiques credenciales.

Los registros de administración se leen desde Oracle y no se restauran desde el almacenamiento local del navegador; así se evitan datos de demostración o antiguos que no estén en la base de datos. El estado local anterior del prototipo no se migra automáticamente. La base Oracle debe prepararse antes del primer inicio del backend.
