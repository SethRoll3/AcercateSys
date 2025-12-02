# Sistema de Gestión de Préstamos Cooperativa

## Descripción del Proyecto
Este proyecto es un sistema integral de gestión de préstamos diseñado para cooperativas o instituciones financieras similares. Permite la administración eficiente de clientes, préstamos individuales y grupales, planes de pago, historial de pagos, y notificaciones. La aplicación está construida con un enfoque en la escalabilidad, seguridad y facilidad de uso, proporcionando una plataforma robusta para la gestión financiera.

## Características Principales

-   **Gestión de Clientes**:
    -   Registro y edición de información detallada de clientes.
    -   Asignación de roles (Administrador, Asesor, Cliente) con permisos específicos.
    -   Visualización de un historial completo de interacciones y transacciones por cliente.
-   **Gestión de Préstamos Individuales y Grupales**:
    -   Creación y administración de préstamos con diferentes términos y condiciones.
    -   Soporte para préstamos individuales y la capacidad de agrupar clientes para préstamos grupales.
    -   Cálculo automático de planes de pago y amortización.
-   **Planes de Pago y Pagos**:
    -   Generación de calendarios de pago detallados.
    -   Registro de pagos, incluyendo pagos parciales y anticipados.
    -   Seguimiento del estado de los pagos y saldos pendientes.
-   **Notificaciones y Alertas**:
    -   Sistema de notificaciones para recordar fechas de pago, vencimientos y otras alertas importantes.
    -   Comunicación eficiente con clientes y asesores.
-   **Roles y Permisos**:
    -   Control de acceso basado en roles para Administradores, Asesores y Clientes.
    -   Los administradores tienen control total, los asesores gestionan clientes y préstamos, y los clientes pueden ver sus propios préstamos y pagos.
-   **Panel de Control (Dashboard)**:
    -   Vista general de métricas clave, como préstamos activos, pagos pendientes y rendimiento general.
    -   Gráficos y reportes para una toma de decisiones informada.
-   **Seguridad**:
    -   Autenticación de usuarios robusta.
    -   Reglas de seguridad a nivel de fila (RLS) implementadas en la base de datos para proteger la información sensible.
    -   Uso de variables de entorno para credenciales y configuraciones sensibles.

## Tecnologías Utilizadas

-   **Frontend**:
    -   **Next.js**: Framework de React para el desarrollo de aplicaciones web con renderizado del lado del servidor (SSR) y generación de sitios estáticos (SSG).
    -   **React**: Biblioteca de JavaScript para construir interfaces de usuario interactivas.
    -   **TypeScript**: Superset de JavaScript que añade tipado estático para mejorar la robustez del código.
    -   **Tailwind CSS**: Framework CSS utilitario para un diseño rápido y responsivo.
    -   **shadcn/ui**: Colección de componentes de UI reusables y accesibles construidos con Tailwind CSS y Radix UI.
    -   **Lucide React**: Biblioteca de iconos.
    -   **Sonner**: Componente de notificaciones toast.
-   **Backend y Base de Datos**:
    -   **Supabase**: Plataforma de código abierto que proporciona una base de datos PostgreSQL, autenticación, APIs instantáneas y funciones Edge.
    -   **PostgreSQL**: Sistema de gestión de bases de datos relacionales robusto y extensible.
    -   **API Routes (Next.js)**: Para la creación de endpoints de API personalizados y la interacción segura con Supabase.
-   **Herramientas de Desarrollo**:
    -   **ESLint**: Para mantener la calidad y consistencia del código.
    -   **Prettier**: Para formatear automáticamente el código.
    -   **Dotenv**: Para la gestión de variables de entorno.

## Arquitectura

La aplicación sigue una arquitectura moderna basada en Next.js, aprovechando sus capacidades de renderizado del lado del servidor y del cliente.

-   **Frontend**: Desarrollado con React y Next.js, utilizando `shadcn/ui` para los componentes de la interfaz de usuario y `Tailwind CSS` para el estilado. La interacción con la API se realiza a través de `fetch` a las API Routes de Next.js.
-   **Backend**: Las API Routes de Next.js actúan como una capa intermedia, manejando las solicitudes del frontend y comunicándose con Supabase. Esto permite implementar lógica de negocio y seguridad adicional antes de interactuar con la base de datos.
-   **Base de Datos**: Supabase (PostgreSQL) es el corazón del sistema, almacenando toda la información de clientes, préstamos, pagos y usuarios. Se utilizan las características de autenticación de Supabase y las Row Level Security (RLS) para asegurar los datos.
-   **Autenticación y Autorización**: Supabase maneja la autenticación de usuarios. La autorización se gestiona mediante roles almacenados en la base de datos y verificados en las API Routes y las políticas de RLS.

## Cómo Empezar

Sigue estos pasos para configurar y ejecutar el proyecto en tu entorno local.

### Prerrequisitos

Asegúrate de tener instalado lo siguiente:

-   Node.js (versión 18 o superior)
-   npm o Yarn
-   Git
-   Una cuenta de Supabase y un proyecto configurado.

### Configuración del Proyecto

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/tu-usuario/cooperativa.git
    cd cooperativa
    ```

2.  **Instalar dependencias**:
    ```bash
    npm install
    # o
    yarn install
    ```

3.  **Configurar variables de entorno**:
    Crea un archivo `.env.local` en la raíz del proyecto y añade tus credenciales de Supabase:
    ```
    NEXT_PUBLIC_SUPABASE_URL=tu_url_supabase
    NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anon_supabase
    SUPABASE_SERVICE_ROLE_KEY=tu_clave_rol_servicio_supabase
    ```
    Puedes encontrar estas claves en la configuración de tu proyecto Supabase. La `SUPABASE_SERVICE_ROLE_KEY` es crucial para operaciones que requieren eludir RLS, como la eliminación en cascada.

4.  **Configurar la Base de Datos Supabase**:
    -   Asegúrate de que tu base de datos PostgreSQL en Supabase tenga las tablas necesarias (clientes, grupos, prestamos, pagos, usuarios, etc.) y las relaciones configuradas.
    -   Implementa las políticas de Row Level Security (RLS) adecuadas para cada tabla para asegurar que los usuarios solo puedan acceder a los datos a los que tienen permiso.
    -   Configura los triggers o funciones de base de datos si son necesarios para la lógica de negocio (ej. eliminación en cascada).

### Ejecutar la Aplicación

1.  **Iniciar el servidor de desarrollo**:
    ```bash
    npm run dev
    # o
    yarn dev
    ```
2.  Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver la aplicación.

## Uso

-   **Administradores**: Acceso completo para gestionar usuarios, clientes, grupos y préstamos.
-   **Asesores**: Pueden crear y gestionar clientes y sus préstamos asociados.
-   **Clientes**: Pueden ver el estado de sus propios préstamos y el historial de pagos.

## Contribución

Las contribuciones son bienvenidas. Por favor, sigue estos pasos:

1.  Haz un fork del repositorio.
2.  Crea una nueva rama (`git checkout -b feature/nueva-caracteristica`).
3.  Realiza tus cambios y asegúrate de que el código pase las pruebas y el linter.
4.  Haz commit de tus cambios (`git commit -am 'feat: Añadir nueva característica'`).
5.  Sube tu rama (`git push origin feature/nueva-caracteristica`).
6.  Abre un Pull Request.

## Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.