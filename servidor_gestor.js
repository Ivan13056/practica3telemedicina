var conexion = require("./conexion_mysql.js");
var express = require("express");
var jwt = require("jsonwebtoken");
var CLAVE_JWT = "clave_secreta_telemedicina";
var app = express();

// NOTA: ya no se necesita cargar datos.js ni los contadores manuales
// (idSanitarios, idGestores, idRecursos). MySQL asigna los ids solo
// con AUTO_INCREMENT, y se recuperan con `resultado.insertId` tras un INSERT.

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


// --- MÉTODO NUEVO (persistencia MySQL) ---
app.get("/api/categorias", function (req, res) {
    var sql = "SELECT * FROM categorias";
    conexion.query(sql, function (err, categorias) {
        if (err) {
            console.log("Error al realizar la select", err);
            res.status(500).json("Error al realizar la consulta");
        } else {
            res.status(200).json(categorias);
        }
    });
});
// Para qué sirve: devuelve el catálogo completo de categorías. Se usa para
// rellenar los <select> de categoría tanto en el filtro de búsqueda como en
// la ficha de recurso. Al ser un catálogo fijo (el enunciado dice que no hace
// falta gestionarlo), no necesita ni id ni filtros: siempre se pide entero.

// --- MÉTODO NUEVO ---
app.get("/api/ubicaciones", function (req, res) {
    var sql = "SELECT * FROM ubicaciones";
    conexion.query(sql, function (err, ubicaciones) {
        if (err) {
            console.log("Error al realizar la select", err);
            res.status(500).json("Error al realizar la consulta");
        } else {
            res.status(200).json(ubicaciones);
        }
    });
});
// Para qué sirve: igual que categorias, alimenta el <select> de ubicación
// (filtro de búsqueda y ficha de recurso). Mismo patrón, sin filtros.

// --- MÉTODO NUEVO ---
app.get("/api/modelos", function (req, res) {
    var sql = "SELECT * FROM modelos";
    conexion.query(sql, function (err, modelos) {
        if (err) {
            console.log("Error al realizar la select", err);
            res.status(500).json("Error al realizar la consulta");
        } else {
            res.status(200).json(modelos);
        }
    });
});
// Para qué sirve: da los modelos (con su categoría y horas_maximas) para
// rellenar el <select> de modelo y para que el cliente pueda resolver
// "a qué categoría pertenece este recurso" sin pedirlo al servidor cada vez.

// --- MÉTODO NUEVO ---
// El body sigue llamando "login" a la credencial (así lo especifica el
// enunciado con su ejemplo JSON), pero se compara contra la columna real: usuario.
app.post("/api/gestores/login", function (req, res) {
    var sql = "SELECT * FROM gestores WHERE usuario = ? AND password = ?";
    conexion.query(sql, [req.body.login, req.body.password], function (err, resultado) {
        if (err) {
            console.log("Error al realizar la select", err);
            res.status(500).json("Error al realizar la consulta");
        } else if (resultado.length === 0) {
            res.status(403).json("Error en el login");
        } else {
            var token = jwt.sign({ id: resultado[0].id }, CLAVE_JWT, { expiresIn: "2h" });
            res.status(200).json({ id: resultado[0].id, token: token });
        }
    });
});
// Para qué sirve: valida las credenciales que manda la pantalla de login y,
// si son correctas, devuelve el id del gestor (que el cliente guarda en
// memoria para las siguientes peticiones, ya que nunca se muestra en la web).
// Características:
// - `.find()` síncrono se sustituye por un WHERE en la propia consulta.
// - El resultado SQL es siempre un array; por eso se comprueba
//   `resultado.length === 0` en vez de `=== undefined`.
// - Placeholders `?` con array de valores en vez de concatenar el string
//   a mano: el driver escapa los valores automáticamente.

// --- MÉTODO NUEVO ---
app.post("/api/gestores", function (req, res) {
    var sqlComprobar = "SELECT * FROM gestores WHERE usuario = ?";
    conexion.query(sqlComprobar, [req.body.usuario], function (err, existente) {
        if (err) {
            console.log("Error al comprobar el usuario", err);
            res.status(500).json("Error al realizar la consulta");
            return;
        }

        if (existente.length > 0) {
            res.status(403).json("Error, usuario ya en uso.");
            return;
        }

        var sqlInsertar = "INSERT INTO gestores (nombre, apellidos, usuario, password) VALUES (?, ?, ?, ?)";
        var valores = [req.body.nombre, req.body.apellidos, req.body.usuario, req.body.password];

        conexion.query(sqlInsertar, valores, function (err, resultado) {
            if (err) {
                console.log("Error al realizar el insert", err);
                res.status(500).json("Error al realizar la inserción");
            } else {
                res.status(201).json("Gestor creado correctamente");
            }
        });
    });
});
// Para qué sirve: registra un gestor nuevo desde la pantalla de "Registrar".
// Características:
// - Dos consultas ENCADENADAS: el INSERT solo se lanza dentro del callback
//   del SELECT, porque hasta que ese callback llega no sabemos si el usuario
//   ya existe. No hay forma de "esperar" de forma síncrona a la BD.
// - `id: idGestores` desaparece: la columna es AUTO_INCREMENT.
// - Cada `return;` tras un error evita que el código siga y se intente
//   responder dos veces.

// --- MÉTODO NUEVO ---
app.put("/api/gestores/:id", function (req, res) {
    var id = req.params.id;

    var sqlExiste = "SELECT * FROM gestores WHERE id = ?";
    conexion.query(sqlExiste, [id], function (err, gestor) {
        if (err) {
            console.log("Error al comprobar el gestor", err);
            res.status(500).json("Error al realizar la consulta");
            return;
        }

        if (gestor.length === 0) {
            res.status(404).json("Gestor no encontrado");
            return;
        }

        var sqlDuplicado = "SELECT * FROM gestores WHERE usuario = ? AND id != ?";
        conexion.query(sqlDuplicado, [req.body.usuario, id], function (err, usuarioUsado) {
            if (err) {
                console.log("Error al comprobar el usuario", err);
                res.status(500).json("Error al realizar la consulta");
                return;
            }

            if (usuarioUsado.length > 0) {
                res.status(403).json("Error, usuario ya en uso");
                return;
            }

            var sqlUpdate = "UPDATE gestores SET nombre = ?, apellidos = ?, usuario = ?, password = ? WHERE id = ?";
            var valores = [req.body.nombre, req.body.apellidos, req.body.usuario, req.body.password, id];

            conexion.query(sqlUpdate, valores, function (err, resultado) {
                if (err) {
                    console.log("Error al realizar el update", err);
                    res.status(500).json("Error al realizar la actualización");
                } else {
                    res.status(200).json("Gestor actualizado correctamente");
                }
            });
        });
    });
});
// Para qué sirve: guarda los cambios cuando el gestor edita sus propios
// datos ("Editar datos" en la app).
// Características: el más anidado de todos — TRES consultas en cadena
// (existe → usuario duplicado en otro id → update), cada una dentro del
// callback de la anterior.

// --- MÉTODO NUEVO ---
app.get("/api/gestores/:id", function (req, res) {
    var sql = "SELECT id, nombre, apellidos, usuario FROM gestores WHERE id = ?";
    conexion.query(sql, [req.params.id], function (err, resultado) {
        if (err) {
            console.log("Error al realizar la select", err);
            res.status(500).json("Error al realizar la consulta");
        } else if (resultado.length === 0) {
            res.status(404).json("Gestor no encontrado");
        } else {
            res.status(200).json(resultado[0]);
        }
    });
});
// Para qué sirve: rellena la bienvenida ("Bienvenido X Y") y precarga el
// formulario de edición de datos del gestor.
// Características: se piden solo las columnas necesarias en el propio SQL
// (`SELECT id, nombre, apellidos, usuario`) en vez de pedir todo y filtrar
// en JS — así el password nunca sale de la base de datos.

// --- MÉTODO NUEVO ---
app.get("/api/sanitarios/:id", function (req, res) {
    var sql = "SELECT id, nombre, apellidos, usuario FROM sanitarios WHERE id = ?";
    conexion.query(sql, [req.params.id], function (err, resultado) {
        if (err) {
            console.log("Error al realizar la select", err);
            res.status(500).json("Error al realizar la consulta");
        } else if (resultado.length === 0) {
            res.status(404).json("Sanitario no encontrado");
        } else {
            res.status(200).json(resultado[0]);
        }
    });
});
// Para qué sirve: el cliente lo usa para traducir el id numérico de
// sanitario a su nombre completo en las tablas de reservas y reseñas
// (así nunca se muestra un id en pantalla).

// --- MÉTODO NUEVO ---
app.get("/api/recursos", function (req, res) {
    var sql = "SELECT r.* FROM recursos r JOIN modelos m ON r.modelo = m.id WHERE 1 = 1";
    var params = [];

    if (req.query.categoria !== undefined) {
        sql += " AND m.categoria = ?";
        params.push(req.query.categoria);
    }
    if (req.query.modelo !== undefined) {
        sql += " AND r.modelo = ?";
        params.push(req.query.modelo);
    }
    if (req.query.ubicacion !== undefined) {
        sql += " AND r.ubicacion = ?";
        params.push(req.query.ubicacion);
    }
    if (req.query.estado !== undefined) {
        sql += " AND r.estado = ?";
        params.push(req.query.estado);
    }

    conexion.query(sql, params, function (err, recursos) {
        if (err) {
            console.log("Error al realizar la select", err);
            res.status(500).json("Error al realizar la consulta");
        } else {
            res.status(200).json(recursos);
        }
    });
});
// Para qué sirve: alimenta la tabla de resultados de la búsqueda de recursos,
// con los 4 filtros opcionales que ofrece la pantalla.
// Características: el endpoint más distinto del original.
// - El SQL se construye dinámicamente, añadiendo "AND columna = ?" solo para
//   los filtros que el cliente ha mandado, con su valor en el array `params`.
// - `WHERE 1 = 1` permite concatenar siempre "AND ..." sin mirar si es el
//   primer filtro.
// - El filtro por categoría necesita un JOIN con `modelos`, porque la
//   categoría no está en `recursos` (solo el id del modelo).
// - `SELECT r.*` con alias evita arrastrar columnas de `modelos` (como su
//   propio `id`, que chocaría con el `id` de `recursos`).

// --- MÉTODO NUEVO ---
app.get("/api/recursos/:id", function (req, res) {
    var sql = "SELECT * FROM recursos WHERE id = ?";
    conexion.query(sql, [req.params.id], function (err, resultado) {
        if (err) {
            console.log("Error al realizar la select", err);
            res.status(500).json("Error al realizar la consulta");
        } else if (resultado.length === 0) {
            res.status(404).json("Recurso no encontrado");
        } else {
            res.status(200).json(resultado[0]);
        }
    });
});
// Para qué sirve: carga los datos de un recurso concreto al abrir su ficha.

// --- MÉTODO NUEVO ---
app.post("/api/recursos", function (req, res) {
    var sql = "INSERT INTO recursos (modelo, ubicacion, numero_serie, estado) VALUES (?, ?, ?, ?)";
    var valores = [req.body.modelo, req.body.ubicacion, req.body.numero_serie, req.body.estado];

    conexion.query(sql, valores, function (err, resultado) {
        if (err) {
            console.log("Error al realizar el insert", err);
            res.status(500).json("Error al realizar la inserción");
        } else {
            res.status(201).json(resultado.insertId);
        }
    });
});
// Para qué sirve: crea un recurso nuevo desde "Añadir Recurso".
// Características: `idRecursos++` desaparece — el id lo pone MySQL solo
// (AUTO_INCREMENT) y se recupera con `resultado.insertId`.

// --- MÉTODO NUEVO ---
app.put("/api/recursos/:id", function (req, res) {
    var sql = "UPDATE recursos SET modelo = ?, ubicacion = ?, numero_serie = ?, estado = ? WHERE id = ?";
    var valores = [req.body.modelo, req.body.ubicacion, req.body.numero_serie, req.body.estado, req.params.id];

    conexion.query(sql, valores, function (err, resultado) {
        if (err) {
            console.log("Error al realizar el update", err);
            res.status(500).json("Error al realizar la actualización");
        } else if (resultado.affectedRows === 0) {
            res.status(404).json("Recurso no encontrado");
        } else {
            res.status(200).json("Recurso actualizado correctamente");
        }
    });
});
// Para qué sirve: guarda los cambios al editar la ficha de un recurso.
// Características: a diferencia de gestores, aquí no hay regla de negocio
// previa que comprobar — una sola consulta. Se lanza el UPDATE directo y se
// mira `resultado.affectedRows`: 0 = no existía (404), 1 = actualizado.

// --- MÉTODO NUEVO ---
app.delete("/api/recursos/:id", function (req, res) {
    var sql = "DELETE FROM recursos WHERE id = ?";
    conexion.query(sql, [req.params.id], function (err, resultado) {
        if (err) {
            console.log("Error al realizar el delete", err);
            res.status(500).json("Error al realizar el borrado");
        } else if (resultado.affectedRows === 0) {
            res.status(404).json("Recurso no encontrado");
        } else {
            res.status(200).json("Recurso eliminado correctamente");
        }
    });
});
// Para qué sirve: borra un recurso desde el botón "Borrar" del listado.
// Características / OJO: `findIndex` + `splice` (memoria) se convierte en un
// DELETE + `affectedRows`. Pero hay una diferencia real de comportamiento
// que no tenías antes: si el recurso tiene reservas o reseñas asociadas, la
// base de datos RECHAZA el borrado por la clave foránea (error
// ER_ROW_IS_REFERENCED_2), y aquí eso cae en el `if (err)` como un 500
// genérico. La versión en memoria lo borraba igualmente, dejando huérfanas
// esas reservas/reseñas. Pendiente de decidir contigo si se distingue ese
// caso con un código de estado más claro (p.ej. 409).

// --- MÉTODO NUEVO ---
app.get("/api/recursos/:id/reservas", function (req, res) {
    var sqlRecurso = "SELECT * FROM recursos WHERE id = ?";
    conexion.query(sqlRecurso, [req.params.id], function (err, recurso) {
        if (err) {
            console.log("Error al comprobar el recurso", err);
            res.status(500).json("Error al realizar la consulta");
            return;
        }

        if (recurso.length === 0) {
            res.status(404).json("Recurso no encontrado");
            return;
        }

        var sqlReservas = "SELECT * FROM reservas WHERE recurso = ?";
        conexion.query(sqlReservas, [req.params.id], function (err, reservas) {
            if (err) {
                console.log("Error al realizar la select", err);
                res.status(500).json("Error al realizar la consulta");
            } else {
                res.status(200).json(reservas);
            }
        });
    });
});
// Para qué sirve: rellena la tabla "Reservas" dentro de la ficha del recurso.
// Características: dos consultas encadenadas, porque son dos preguntas
// distintas: "¿existe el recurso?" (404 si no) y "¿qué reservas tiene?"
// (puede ser, legítimamente, un array vacío). Un JOIN único no distinguiría
// "recurso sin reservas" de "recurso inexistente".

// --- MÉTODO NUEVO ---
app.get("/api/recursos/:id/resenyas", function (req, res) {
    var sqlRecurso = "SELECT * FROM recursos WHERE id = ?";
    conexion.query(sqlRecurso, [req.params.id], function (err, recurso) {
        if (err) {
            console.log("Error al comprobar el recurso", err);
            res.status(500).json("Error al realizar la consulta");
            return;
        }

        if (recurso.length === 0) {
            res.status(404).json("Recurso no encontrado");
            return;
        }

        var sqlResenyas = "SELECT * FROM resenyas WHERE recurso = ?";
        conexion.query(sqlResenyas, [req.params.id], function (err, resenyas) {
            if (err) {
                console.log("Error al realizar la select", err);
                res.status(500).json("Error al realizar la consulta");
            } else {
                res.status(200).json(resenyas);
            }
        });
    });
});
// Para qué sirve: rellena la tabla "Reseñas" dentro de la ficha del recurso.
// Mismo patrón que /reservas y por la misma razón.


//-----------------------------------------------------------------------------------------------------------------------------------------------
//-----------------------------------------------------------------------------------------------------------------------------------------------
//-----------------------------------------------------------------------------------------------------------------------------------------------

app.post("/api/areas_salud", function(req,res) {
    var sql = "INSERT INTO areas (codigo_postal, nombre, gestor, sanitario) VALUES (?, ?, ?, ?)";
    var valores = [req.body.codigo_postal, req.body.nombre, req.body.gestor, req.body.sanitario];

    conexion.query(sql, valores, function (err, resultado) {
        if (err) {
            console.log("Error al realizar el insert", err);
            res.status(500).json("Error al realizar la inserción");
        } else {
            res.status(201).json(resultado.insertId);
        }
    });
})
app.listen(3000);