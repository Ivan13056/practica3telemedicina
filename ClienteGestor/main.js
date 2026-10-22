window.onload = function () {

    // http://localhost:3000/appCliente/gestor.html

    // =========================
    // ESTADO
    // =========================

    let gestorId = null;
    let conexion = null;
    let recursoActual = null;

    let listaCategorias = [];
    let listaModelos = [];
    let listaUbicaciones = [];
    let cacheSanitarios = {};

    // =========================
    // MINISTERIO
    // =========================

    const URL_MINISTERIO = "https://undefined.ua.es/telemedicina/api/datos";
    const ID_AREA = 17;

    const AREAS = {
        1: "Alergología", 2: "Anestesiología", 3: "Cardiología", 4: "Cirugía General",
        5: "Dermatología", 6: "Aparato Digestivo", 7: "Endocrinología", 8: "Ginecología",
        9: "Hematología", 10: "Medicina Interna", 11: "Neumología", 12: "Neurología",
        13: "Oftalmología", 14: "Oncología", 15: "Pediatría", 16: "Psiquiatría",
        17: "Traumatología", 18: "Urología"
    };

    // =========================
    // PANTALLAS
    // =========================

    const login = document.getElementById("pantalla-login");
    const gestor = document.getElementById("pantalla-gestor");
    const inicio = document.getElementById("pantalla-inicio");
    const recurso = document.getElementById("pantalla-recurso");

    function ocultarTodo() {
        login.hidden = true;
        gestor.hidden = true;
        inicio.hidden = true;
        recurso.hidden = true;
    }

    function mostrar(pantalla) {
        ocultarTodo();
        pantalla.hidden = false;
    }

    // =========================
    // FORMATEAR FECHA
    // =========================

    function formatearFecha(fechaISO) {
        if (!fechaISO) return "-";

        let fecha = new Date(fechaISO);

        return fecha.toLocaleString("es-ES", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function traducirEstado(e) {
        if (e == 0) return "Operativo";
        if (e == 1) return "Defectuoso";
        if (e == 2) return "Mantenimiento";
        return e;
    }

    function nombreCategoriaDesdeModelo(idModelo) {

        let modelo = listaModelos.find(m => m.id == idModelo);
        if (!modelo) return "";

        let categoria = listaCategorias.find(c => c.id == modelo.categoria);
        return categoria ? categoria.nombre : "";
    }

    function nombreModelo(id) {
        let m = listaModelos.find(x => x.id == id);
        return m ? m.nombre : id;
    }

    function nombreUbicacion(id) {
        let u = listaUbicaciones.find(x => x.id == id);
        return u ? u.nombre : id;
    }

    function nombreSanitario(id, callback) {
        if (cacheSanitarios[id]) {
            callback(cacheSanitarios[id]);
            return;
        }
        rest.get("/api/sanitarios/" + id, function (s, data) {
            let nombreCompleto = data.nombre + " " + data.apellidos;
            cacheSanitarios[id] = nombreCompleto;
            callback(nombreCompleto);
        });
    }

    // =========================
    // CARGAR SELECTS
    // =========================

    function cargarDatosIniciales() {

        rest.get("/api/categorias", function (s, datos) {
            listaCategorias = datos;
            rellenarSelect("filtro-categoria", datos, true);
            rellenarSelect("recurso-categoria", datos, false);
        });

        rest.get("/api/modelos", function (s, datos) {
            listaModelos = datos;
            rellenarSelect("filtro-modelo", datos, true);
            rellenarSelect("recurso-modelo", datos, false);
        });

        rest.get("/api/ubicaciones", function (s, datos) {
            listaUbicaciones = datos;
            rellenarSelect("filtro-ubicacion", datos, true);
            rellenarSelect("recurso-ubicacion", datos, false);
        });
    }

    function rellenarSelect(id, datos, incluirTodos) {

        let select = document.getElementById(id);
        select.innerHTML = "";

        if (incluirTodos) {
            select.innerHTML = '<option value="">Todos</option>';
        }

        datos.forEach(d => {
            let option = document.createElement("option");
            option.value = d.id;
            option.textContent = d.nombre;
            select.appendChild(option);
        });
    }

    // =========================
    // IR A REGISTRO
    // =========================

    document.getElementById("btn-ir-registro").onclick = function () {

        gestorId = null;

        document.getElementById("gestor-nombre").value = "";
        document.getElementById("gestor-apellidos").value = "";
        document.getElementById("gestor-usuario").value = "";
        document.getElementById("gestor-password").value = "";

        mostrar(gestor);
    };

    // =========================
    // GUARDAR GESTOR
    // =========================

    document.getElementById("btn-guardar-gestor").onclick = function () {

        let nombre = document.getElementById("gestor-nombre").value;
        let apellidos = document.getElementById("gestor-apellidos").value;
        let usuario = document.getElementById("gestor-usuario").value;
        let password = document.getElementById("gestor-password").value;

        let data = {
            nombre: nombre,
            apellidos: apellidos,
            usuario: usuario,
            password: password
        };

        if (gestorId === null) {

            // CREAR
            rest.post("/api/gestores", data, function (status, response) {

                if (status === 201) {
                    alert("Gestor creado correctamente");
                    mostrar(login);
                } else {
                    alert(response);
                }
            });

        } else {

            // EDITAR
            rest.put("/api/gestores/" + gestorId, data, function (status, response) {

                if (status === 200) {
                    alert("Datos actualizados");
                    mostrar(inicio);
                } else {
                    alert(response);
                }
            });
        }
    };

    // =========================
    // CANCELAR REGISTRO
    // =========================

    document.getElementById("btn-cancelar-gestor").onclick = function () {
        mostrar(login);
    };

    // =========================
    // SALIR
    // =========================

    document.getElementById("btn-salir").onclick = function () {
        conexion.close();
        conexion = null;
        gestorId = null;
        rest.token = null;
        mostrar(login);
    };

    // =========================
    // LOGIN
    // =========================

    document.getElementById("btn-login").onclick = function () {

        let usuario = document.getElementById("login-usuario").value;
        let password = document.getElementById("login-password").value;

        rest.post("/api/gestores/login", {
            login: usuario,
            password: password
        }, function (status, response) {

            if (status === 200) {
                gestorId = response.id;
                rest.token = response.token;
                cargarDatosIniciales();
                cargarNombreGestor();
                mostrar(inicio);
                cargarRanking();

                // Conexión 
                conexion = new WebSocket("ws://localhost:3502", "avisos");
                conexion.addEventListener("open", function() {
                    conexion.addEventListener("message", function(msg) {
                        msg = JSON.parse(msg.data);
                        switch(msg.operacion) {
                            case "aviso":
                                var tabla = document.getElementById("avisosBody");
                                var fila = document.createElement("tr");
                                
                                var colores = { rojo: "#fdecea", azul: "#e8f4fd", verde: "#eafaf1" };
                                fila.style.backgroundColor = colores[msg.color];
                                
                                fila.innerHTML = `
                                    <td>${new Date(msg.fecha).toLocaleString()}</td>
                                    <td>${msg.origen}</td>
                                    <td>${msg.texto}</td>
                                `;
                                
                                tabla.appendChild(fila);
                                break;
                        }
                    });

                    conexion.send(JSON.stringify({
                        operacion: "identificar",
                        tipo: "gestor",
                        id: gestorId
                    }));
                });

            } else {
                document.getElementById("login-error").innerText = response;
            }
        });
    };

    function cargarNombreGestor() {
        rest.get("/api/gestores/" + gestorId, function (s, data) {
            document.getElementById("nombre-gestor").innerText =
                data.nombre + " " + data.apellidos;
        });
    }

    // =========================
    // EDITAR DATOS DEL GESTOR
    // =========================

    document.getElementById("btn-editar-gestor").onclick = function () {

        if (!gestorId) return;

        rest.get("/api/gestores/" + gestorId, function (status, data) {

            if (status === 200) {

                document.getElementById("gestor-nombre").value = data.nombre;
                document.getElementById("gestor-apellidos").value = data.apellidos;
                document.getElementById("gestor-usuario").value = data.usuario;

                // dejamos la contraseña vacía por seguridad
                document.getElementById("gestor-password").value = "";

                mostrar(gestor);
            }
        });
    };

    // =========================
    // BUSCAR RECURSOS
    // =========================

    function buscarRecursos() {

        let categoria = document.getElementById("filtro-categoria").value;
        let modelo = document.getElementById("filtro-modelo").value;
        let ubicacion = document.getElementById("filtro-ubicacion").value;
        let estado = document.getElementById("filtro-estado").value;

        let url = "/api/recursos?";

        if (categoria) url += "categoria=" + categoria + "&";
        if (modelo) url += "modelo=" + modelo + "&";
        if (ubicacion) url += "ubicacion=" + ubicacion + "&";
        if (estado) url += "estado=" + estado + "&";

        rest.get(url, function (status, datos) {

            let tabla = document.getElementById("tabla-recursos");
            tabla.innerHTML = "";

            datos.forEach(r => {

                let fila = document.createElement("tr");

                fila.innerHTML = `
                    <td>${r.numero_serie}</td>
                    <td>${nombreCategoriaDesdeModelo(r.modelo)}</td>
                    <td>${nombreModelo(r.modelo)}</td>
                    <td>${nombreUbicacion(r.ubicacion)}</td>
                    <td>${traducirEstado(r.estado)}</td>
                    <td>
                        <button data-id="${r.id}" class="abrir">Abrir</button>
                        <button data-id="${r.id}" class="borrar">Borrar</button>
                    </td>
                `;

                tabla.appendChild(fila);
            });

            document.querySelectorAll(".abrir").forEach(btn => {
                btn.onclick = function () {
                    abrirRecurso(this.dataset.id);
                };
            });

            document.querySelectorAll(".borrar").forEach(btn => {
                btn.onclick = function () {
                    let id = this.dataset.id;
                    rest.delete("/api/recursos/" + id, function (status) {
                        if (status === 200) {
                            buscarRecursos();
                        }
                    });
                };
            });
        });
    }

    document.getElementById("btn-buscar").onclick = buscarRecursos;

    // =========================
    // ABRIR RECURSO
    // =========================

    function abrirRecurso(id) {

        recursoActual = id;

        rest.get("/api/recursos/" + id, function (s, data) {

            // Buscar modelo
            let modelo = listaModelos.find(m => m.id == data.modelo);

            if (modelo) {
                document.getElementById("recurso-categoria").value = modelo.categoria;
            }

            document.getElementById("recurso-modelo").value = data.modelo;
            document.getElementById("recurso-numero-serie").value = data.numero_serie;
            document.getElementById("recurso-ubicacion").value = data.ubicacion;
            document.getElementById("recurso-estado").value = data.estado;

            cargarReservas(id);
            cargarResenyas(id);

            mostrar(recurso);
        });
    }

    // =========================
    // RESERVAS
    // =========================

    function calcularColorReserva(r) {
        if (r.fecha_fin) return "#ffffff"; // finalizada: blanco

        if (!r.fecha_inicio) return "#eafaf1"; // pendiente de iniciar: verde

        let inicio = new Date(r.fecha_inicio);
        let limite = new Date(inicio.getTime() + r.horas_estimadas * 60 * 60 * 1000);

        return (new Date() > limite) ? "#fdecea" : "#e8f4fd"; // excedida: rojo / dentro de plazo: azul
    }

    function cargarReservas(id) {

        rest.get("/api/recursos/" + id + "/reservas", function (s, datos) {

            let tabla = document.getElementById("tabla-reservas");
            tabla.innerHTML = "";

            datos.forEach(r => {

                let fila = document.createElement("tr");
                fila.style.backgroundColor = calcularColorReserva(r);

                fila.innerHTML = `
                    <td>Cargando...</td>
                    <td>${r.horas_estimadas}</td>
                    <td>${formatearFecha(r.fecha_peticion)}</td>
                    <td>${formatearFecha(r.fecha_inicio)}</td>
                    <td>${formatearFecha(r.fecha_fin)}</td>
                `;

                tabla.appendChild(fila);

                nombreSanitario(r.sanitario, function (nombre) {
                    fila.children[0].textContent = nombre;
                });
            });
        });
    }

    // =========================
    // RESEÑAS
    // =========================

    function cargarResenyas(id) {

        rest.get("/api/recursos/" + id + "/resenyas", function (s, datos) {

            let tabla = document.getElementById("tabla-resenyas");
            tabla.innerHTML = "";

            datos.forEach(r => {

                let fila = document.createElement("tr");

                fila.innerHTML = `
                    <td>${formatearFecha(r.fecha)}</td>
                    <td>Cargando...</td>
                    <td>${r.valor}</td>
                    <td>${r.descripcion}</td>
                `;

                tabla.appendChild(fila);

                nombreSanitario(r.sanitario, function (nombre) {
                    fila.children[1].textContent = nombre;
                });
            });
        });
    }

    // =========================
    // NUEVO RECURSO
    // =========================

    document.getElementById("btn-nuevo-recurso").onclick = function () {

        recursoActual = null;

        document.getElementById("recurso-categoria").value = "";
        document.getElementById("recurso-modelo").value = "";
        document.getElementById("recurso-numero-serie").value = "";
        document.getElementById("recurso-ubicacion").value = "";
        document.getElementById("recurso-estado").value = 0;

        mostrar(recurso);
    };

    document.getElementById("btn-guardar-recurso").onclick = function () {

        let data = {
            categoria: document.getElementById("recurso-categoria").value,
            modelo: document.getElementById("recurso-modelo").value,
            numero_serie: document.getElementById("recurso-numero-serie").value,
            ubicacion: document.getElementById("recurso-ubicacion").value,
            estado: document.getElementById("recurso-estado").value
        };

        if (recursoActual === null) {

            rest.post("/api/recursos", data, function (s,id) {
                if (s === 201) {
                    alert("Recurso creado");
                    mostrar(inicio);

                    conexion.send(JSON.stringify({
                        operacion: "recursoCreado",
                        idRecurso: id
                    }));

                }
            });

        } else {

            rest.put("/api/recursos/" + recursoActual, data, function (s) {
                if (s === 200) {
                    alert("Recurso actualizado");
                    mostrar(inicio);
                }
            });
        }
    };

    document.getElementById("btn-volver-inicio").onclick = function () {
        mostrar(inicio);
    };

    // =========================
    // CREACIÓN DE ÁREAS (desactivado: el bloque está comentado en gestor.html)
    // =========================
    /*
    document.getElementById("btn-crear-zona").onclick = function () {

        let data = {
            codigo_postal: document.getElementById("codigo-postal").value,
            nombre: document.getElementById("nombre-zona").value,
            gestor: gestorId,
            sanitario: null
        };

        rest.post("/api/areas_salud", data, function (status, response) {

            if (status === 201) {
                alert("Zona creada correctamente");
                document.getElementById("codigo-postal").value = "";
                document.getElementById("nombre-zona").value = "";
                mostrar(inicio);
            } else {
                alert(response);
            }
        });
    };
    */

    // =========================
    // MINISTERIO: ENVIAR RESERVAS
    // =========================

    document.getElementById("btn-enviar-ministerio").onclick = function () {

        let datos = [];
        let recursos = rest.get("/api/recursos").response;

        recursos.forEach(r => {
            let reservas = rest.get("/api/recursos/" + r.id + "/reservas").response;

            reservas.forEach(res => {
                let s = rest.get("/api/sanitarios/" + res.sanitario).response;

                datos.push({
                    nombre: s.nombre,
                    apellidos: s.apellidos,
                    "categoría": nombreCategoriaDesdeModelo(r.modelo),
                    horas_estimadas: res.horas_estimadas,
                    fec_pet: res.fecha_peticion,
                    fec_ini: res.fecha_inicio,
                    fecha_fin: res.fecha_fin
                });
            });
        });

        let envio = {
            id_area: ID_AREA,
            fecha: new Date().toISOString().slice(0, 10),   // YYYY-MM-DD
            datos: datos
        };

        rest.post(URL_MINISTERIO, envio, function (status) {
            if (status >= 200 && status < 300) {
                alert("Reservas enviadas al Ministerio");
                cargarRanking();
            } else {
                alert("Error al enviar: " + status);
            }
        });
    };

    // =========================
    // MINISTERIO: RANKING POR ÁREA
    // =========================

    function cargarRanking() {

        rest.get(URL_MINISTERIO, function (status, registros) {

            if (status !== 200 || !Array.isArray(registros)) return;

            let totales = {};

            registros.forEach(reg => {
                if (!AREAS[reg.id_area] || !reg.datos) return;   // ignora áreas inválidas
                totales[reg.id_area] = (totales[reg.id_area] || 0) + reg.datos.length;
            });

            let ranking = Object.keys(totales).map(id => ({ id: id, total: totales[id] }));
            ranking.sort((a, b) => b.total - a.total);

            let tabla = document.getElementById("tabla-ranking");
            tabla.innerHTML = "";

            ranking.forEach((a, i) => {
                let fila = document.createElement("tr");
                fila.innerHTML = `
                    <td>${i + 1}</td>
                    <td>${AREAS[a.id]}</td>
                    <td>${a.total}</td>
                `;
                tabla.appendChild(fila);
            });
        });
    }

    // =========================
    // INICIALIZACIÓN
    // =========================

    mostrar(login);
};
