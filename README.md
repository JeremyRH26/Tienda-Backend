# Tienda Backend

API en Node.js y Express con MySQL (mysql2). Organización por capas para mantener controladores delgados y la lógica de negocio y acceso a datos separados.

## Estructura de carpetas

```
Tienda-Backend/
├── package.json
├── .env                    # Variables de entorno (no versionar; usar .env.example si lo añades)
└── src/
    ├── server.js           # Punto de entrada: carga env, prueba BD, arranca HTTP
    ├── app.js              # Instancia Express: middlewares globales y montaje de rutas
    ├── db/
    │   └── db.js           # Pool de conexiones MySQL (única exportación: el pool)
    ├── routes/
    │   ├── index.js        # Prefijo /api y agrupación de routers por dominio
    │   └── *.routes.js     # Definición de métodos HTTP y paths por recurso
    ├── controllers/
    │   └── *.controller.js # Recibe req/res, llama servicios, responde o delega errores a next()
    ├── services/
    │   └── *.service.js    # Reglas de negocio y validaciones antes del repositorio
    ├── repositories/
    │   └── *.repository.js # Consultas SQL / llamadas a procedimientos
    └── middleware/
        └── *.js            # Por ejemplo manejo centralizado de errores
```

## Flujo de una petición

Una ruta típica sigue este orden:

**Cliente** → `routes` → `controllers` → `services` → `repositories` → **MySQL**

Los errores controlados pasan por el middleware de errores configurado en `app.js`.

## Scripts

| Comando     | Descripción                          |
|------------|--------------------------------------|
| `npm start` | Ejecuta `src/server.js`             |
| `npm run dev` | Mismo servidor con `--watch` (Node 22) |

Puerto por defecto: **8080** (configurable con `PORT` en `.env`).

## Variables de entorno

Definir al menos: `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` para que el pool y el arranque funcionen correctamente.
