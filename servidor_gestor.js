var express = require("express");
var jwt = require("jsonwebtoken");
var { createClient } = require("@supabase/supabase-js");

var CLAVE_JWT = "clave_secreta_telemedicina";
var app = express();

// ============================================================
// CONEXIÓN CON SUPABASE (PostgreSQL)
// ============================================================
// URL del proyecto y clave pública (anon / publishable key).
// Se sacan de Supabase → Project Settings → API Keys (o del botón "Connect").
var supabaseUrl = "https://ernjzzvyfmcqusitedau.supabase.co";
var supabaseKey = "sb_publishable_z1GccgNAffjUDoita-069g_gBcyOP3F";
var supabase = createClient(supabaseUrl, supabaseKey);

// NOTA: ya no se escribe SQL a mano. supabase-js traduce cada cadena de
// métodos a una petición a la API REST que Supabase genera sobre las tablas:
//   supabase.from("gestores").select("*").eq("id", 3)
//   ≡ SELECT * FROM gestores WHERE id = 3
// Cada llamada devuelve { data, error }: data = filas, error = null si todo fue bien.

console.log("Servidor iniciado correctamente.");

app.use("/appCliente", express.static("ClienteGestor"));
app.use(express.json());

// ============================================================
// AUTENTICACIÓN JWT
// ============================================================
function verificarToken(req, res, next) {
    var cabecera = req.headers["authorization"];

    if (!cabecera || !cabecera.startsWith("Bearer ")) {
        res.status(401).json("Token no proporcionado");
        return;
    }

    var token = cabecera.split(" ")[1];

    jwt.verify(token, CLAVE_JWT, function (err, datos) {
        if (err) {
            res.status(401).json("Token no válido o caducado");
            return;
        }
        req.gestorId = datos.id;   // por si algún servicio lo necesita
        next();
    });
}

// Todo lo que empiece por /api queda protegido, salvo login y registro
app.use("/api", function (req, res, next) {
    if (req.path === "/gestores/login") return next();
    if (req.path === "/gestores" && req.method === "POST") return next();
    verificarToken(req, res, next);
});


// ============================================================
// CATÁLOGOS
// ============================================================
app.get("/api/categorias", async function (req, res) {
    var { data, error } = await supabase.from("categorias").select("*");

    if (error) {
        console.log("Error al realizar la select", error);
        return res.status(500).json("Error al realizar la consulta");
    }
    res.status(200).json(data);
});
// Para qué sirve: catálogo de categorías para los <select> de categoría.
// `async` + `await`: la función espera a que Supabase responda antes de
// seguir, en lugar de anidar callbacks.

app.get("/api/ubicaciones", async function (req, res) {
    var { data, error } = await supabase.from("ubicaciones").select("*");

    if (error) {
        console.log("Error al realizar la select", error);
        return res.status(500).json("Error al realizar la consulta");
    }
    res.status(200).json(data);
});
// Para qué sirve: catálogo de ubicaciones para el <select> de ubicación.

app.get("/api/modelos", async function (req, res) {
    var { data, error } = await supabase.from("modelos").select("*");

    if (error) {
        console.log("Error al realizar la select", error);
        return res.status(500).json("Error al realizar la consulta");
    }
    res.status(200).json(data);
});
// Para qué sirve: modelos (con categoría y horas_maximas) para el <select>
// de modelo y para resolver la categoría de un recurso en el cliente.


// ============================================================
// GESTORES
// ============================================================
// El body llama "login" a la credencial (como en el enunciado), pero se
// compara contra la columna real de la tabla: usuario.
app.post("/api/gestores/login", async function (req, res) {
    var { data, error } = await supabase
        .from("gestores")
        .select("id")
        .eq("usuario", req.body.login)
        .eq("password", req.body.password);

    if (error) {
        console.log("Error al realizar la select", error);
        return res.status(500).json("Error al realizar la consulta");
    }
    if (data.length === 0) {
        return res.status(403).json("Error en el login");
    }

    var token = jwt.sign({ id: data[0].id }, CLAVE_JWT, { expiresIn: "2h" });
    res.status(200).json({ id: data[0].id, token: token });
});
// Para qué sirve: valida credenciales y devuelve id del gestor + token JWT.
// Dos `.eq()` encadenados equivalen a `WHERE usuario = ... AND password = ...`.

app.post("/api/gestores", async function (req, res) {
    var comprobar = await supabase
        .from("gestores")
        .select("id")
        .eq("usuario", req.body.usuario);

    if (comprobar.error) {
        console.log("Error al comprobar el usuario", comprobar.error);
        return res.status(500).json("Error al realizar la consulta");
    }
    if (comprobar.data.length > 0) {
        return res.status(403).json("Error, usuario ya en uso.");
    }

    var insertar = await supabase.from("gestores").insert({
        nombre: req.body.nombre,
        apellidos: req.body.apellidos,
        usuario: req.body.usuario,
        password: req.body.password
    });

    if (insertar.error) {
        console.log("Error al realizar el insert", insertar.error);
        return res.status(500).json("Error al realizar la inserción");
    }
    res.status(201).json("Gestor creado correctamente");
});
// Para qué sirve: registra un gestor nuevo.
// Con await, las dos consultas van una detrás de otra en el mismo nivel,
// sin anidar: el INSERT solo se ejecuta si el SELECT dice que el usuario está libre.
// El INSERT recibe un objeto { columna: valor }; el id lo pone PostgreSQL.

app.put("/api/gestores/:id", async function (req, res) {
    var id = req.params.id;

    var existe = await supabase.from("gestores").select("id").eq("id", id);
    if (existe.error) {
        console.log("Error al comprobar el gestor", existe.error);
        return res.status(500).json("Error al realizar la consulta");
    }
    if (existe.data.length === 0) {
        return res.status(404).json("Gestor no encontrado");
    }

    var duplicado = await supabase
        .from("gestores")
        .select("id")
        .eq("usuario", req.body.usuario)
        .neq("id", id);
    if (duplicado.error) {
        console.log("Error al comprobar el usuario", duplicado.error);
        return res.status(500).json("Error al realizar la consulta");
    }
    if (duplicado.data.length > 0) {
        return res.status(403).json("Error, usuario ya en uso");
    }

    var actualizar = await supabase
        .from("gestores")
        .update({
            nombre: req.body.nombre,
            apellidos: req.body.apellidos,
            usuario: req.body.usuario,
            password: req.body.password
        })
        .eq("id", id);

    if (actualizar.error) {
        console.log("Error al realizar el update", actualizar.error);
        return res.status(500).json("Error al realizar la actualización");
    }
    res.status(200).json("Gestor actualizado correctamente");
});
// Para qué sirve: guarda los cambios cuando el gestor edita sus datos.
// Tres consultas seguidas: existe → usuario duplicado en otro id → update.
// `.neq()` = "not equal" (el `id != ...` del SQL).

app.get("/api/gestores/:id", async function (req, res) {
    var { data, error } = await supabase
        .from("gestores")
        .select("id, nombre, apellidos, usuario")
        .eq("id", req.params.id);

    if (error) {
        console.log("Error al realizar la select", error);
        return res.status(500).json("Error al realizar la consulta");
    }
    if (data.length === 0) {
        return res.status(404).json("Gestor no encontrado");
    }
    res.status(200).json(data[0]);
});
// Para qué sirve: bienvenida y precarga del formulario de edición.
// En select() se piden solo esas columnas: el password nunca sale de la BD.


// ============================================================
// SANITARIOS
// ============================================================
app.get("/api/sanitarios/:id", async function (req, res) {
    var { data, error } = await supabase
        .from("sanitarios")
        .select("id, nombre, apellidos, usuario")
        .eq("id", req.params.id);

    if (error) {
        console.log("Error al realizar la select", error);
        return res.status(500).json("Error al realizar la consulta");
    }
    if (data.length === 0) {
        return res.status(404).json("Sanitario no encontrado");
    }
    res.status(200).json(data[0]);
});
// Para qué sirve: traducir el id de sanitario a su nombre en las tablas de
// reservas y reseñas.


// ============================================================
// RECURSOS
// ============================================================
app.get("/api/recursos", async function (req, res) {
    var consulta = supabase.from("recursos").select("*");

    // La categoría no está en `recursos`, sino en `modelos`: primero se buscan
    // los modelos de esa categoría y luego los recursos cuyo modelo esté entre ellos.
    if (req.query.categoria !== undefined) {
        var modelos = await supabase
            .from("modelos")
            .select("id")
            .eq("categoria", req.query.categoria);

        if (modelos.error) {
            console.log("Error al realizar la select", modelos.error);
            return res.status(500).json("Error al realizar la consulta");
        }

        var idsModelos = modelos.data.map(function (m) { return m.id; });
        consulta = consulta.in("modelo", idsModelos);
    }
    if (req.query.modelo !== undefined) {
        consulta = consulta.eq("modelo", req.query.modelo);
    }
    if (req.query.ubicacion !== undefined) {
        consulta = consulta.eq("ubicacion", req.query.ubicacion);
    }
    if (req.query.estado !== undefined) {
        consulta = consulta.eq("estado", req.query.estado);
    }

    var { data, error } = await consulta;

    if (error) {
        console.log("Error al realizar la select", error);
        return res.status(500).json("Error al realizar la consulta");
    }
    res.status(200).json(data);
});
// Para qué sirve: búsqueda de recursos con 4 filtros opcionales.
// - La consulta se va construyendo: cada filtro que manda el cliente añade
//   un `.eq()`. No se ejecuta hasta el `await consulta` final.
// - `.in("modelo", [1, 4])` ≡ `WHERE modelo IN (1, 4)`.

app.get("/api/recursos/:id", async function (req, res) {
    var { data, error } = await supabase
        .from("recursos")
        .select("*")
        .eq("id", req.params.id);

    if (error) {
        console.log("Error al realizar la select", error);
        return res.status(500).json("Error al realizar la consulta");
    }
    if (data.length === 0) {
        return res.status(404).json("Recurso no encontrado");
    }
    res.status(200).json(data[0]);
});
// Para qué sirve: carga los datos de un recurso al abrir su ficha.

app.post("/api/recursos", async function (req, res) {
    var { data, error } = await supabase
        .from("recursos")
        .insert({
            modelo: req.body.modelo,
            ubicacion: req.body.ubicacion,
            numero_serie: req.body.numero_serie,
            estado: req.body.estado
        })
        .select("id");

    if (error) {
        console.log("Error al realizar el insert", error);
        return res.status(500).json("Error al realizar la inserción");
    }
    res.status(201).json(data[0].id);
});
// Para qué sirve: crea un recurso nuevo.
// `.select("id")` tras el insert hace que Supabase devuelva la fila creada
// con su id generado (sustituye al `insertId` de MySQL).

app.put("/api/recursos/:id", async function (req, res) {
    var { data, error } = await supabase
        .from("recursos")
        .update({
            modelo: req.body.modelo,
            ubicacion: req.body.ubicacion,
            numero_serie: req.body.numero_serie,
            estado: req.body.estado
        })
        .eq("id", req.params.id)
        .select("id");

    if (error) {
        console.log("Error al realizar el update", error);
        return res.status(500).json("Error al realizar la actualización");
    }
    if (data.length === 0) {
        return res.status(404).json("Recurso no encontrado");
    }
    res.status(200).json("Recurso actualizado correctamente");
});
// Para qué sirve: guarda los cambios de la ficha de un recurso.
// `.select("id")` devuelve las filas modificadas: si viene vacío, no existía (404).

app.delete("/api/recursos/:id", async function (req, res) {
    var { data, error } = await supabase
        .from("recursos")
        .delete()
        .eq("id", req.params.id)
        .select("id");

    if (error && error.code === "23503") {
        return res.status(409).json("No se puede borrar: el recurso tiene reservas, reseñas o revisiones asociadas");
    }
    if (error) {
        console.log("Error al realizar el delete", error);
        return res.status(500).json("Error al realizar el borrado");
    }
    if (data.length === 0) {
        return res.status(404).json("Recurso no encontrado");
    }
    res.status(200).json("Recurso eliminado correctamente");
});
// Para qué sirve: borra un recurso desde el botón "Borrar" del listado.
// Si otra tabla lo referencia, PostgreSQL rechaza el borrado con el código
// 23503 (violación de clave foránea) y se responde 409 Conflict.

app.get("/api/recursos/:id/reservas", async function (req, res) {
    var recurso = await supabase.from("recursos").select("id").eq("id", req.params.id);

    if (recurso.error) {
        console.log("Error al comprobar el recurso", recurso.error);
        return res.status(500).json("Error al realizar la consulta");
    }
    if (recurso.data.length === 0) {
        return res.status(404).json("Recurso no encontrado");
    }

    var reservas = await supabase.from("reservas").select("*").eq("recurso", req.params.id);

    if (reservas.error) {
        console.log("Error al realizar la select", reservas.error);
        return res.status(500).json("Error al realizar la consulta");
    }
    res.status(200).json(reservas.data);
});
// Para qué sirve: tabla "Reservas" de la ficha del recurso. Dos consultas
// para distinguir "recurso inexistente" (404) de "recurso sin reservas" ([]).

app.get("/api/recursos/:id/resenyas", async function (req, res) {
    var recurso = await supabase.from("recursos").select("id").eq("id", req.params.id);

    if (recurso.error) {
        console.log("Error al comprobar el recurso", recurso.error);
        return res.status(500).json("Error al realizar la consulta");
    }
    if (recurso.data.length === 0) {
        return res.status(404).json("Recurso no encontrado");
    }

    var resenyas = await supabase.from("resenyas").select("*").eq("recurso", req.params.id);

    if (resenyas.error) {
        console.log("Error al realizar la select", resenyas.error);
        return res.status(500).json("Error al realizar la consulta");
    }
    res.status(200).json(resenyas.data);
});
// Para qué sirve: tabla "Reseñas" de la ficha del recurso. Mismo patrón.


// ============================================================
// ÁREAS DE SALUD
// ============================================================
app.post("/api/areas_salud", async function (req, res) {
    var { data, error } = await supabase
        .from("areas")
        .insert({
            codigo_postal: req.body.codigo_postal,
            nombre: req.body.nombre,
            gestor: req.body.gestor,
            sanitario: req.body.sanitario
        })
        .select("codigo_postal");

    if (error) {
        console.log("Error al realizar el insert", error);
        return res.status(500).json("Error al realizar la inserción");
    }
    res.status(201).json(data[0].codigo_postal);
});
// Para qué sirve: crea un área de salud. La clave es codigo_postal (no es
// autoincremental), así que se devuelve ese valor.

app.listen(3000);
