import json
from datetime import date
from flask import Flask, jsonify, request, render_template
from groq import Groq

app = Flask(__name__)


def cargar_json(plan_json):
    with open(plan_json, encoding="utf-8") as f:
        return json.load(f)

def filtrar_plan_python(plan, filtros):
    # Idiomas: plan debe contener todos los idiomas requeridos si están definidos
    idiomas_requeridos = filtros.get("idiomas_requeridos")
    if idiomas_requeridos:
        idiomas_plan = [str(x).lower() for x in plan.get("idiomas", [])]
        for idioma in idiomas_requeridos:
            if str(idioma).lower() not in idiomas_plan:
                return False, f"Falta el idioma requerido: {idioma}"

    # Reserva: si el usuario prefiere "si" o "no", debe coincidir
    prefiere_reserva = filtros.get("prefiere_reserva")
    if prefiere_reserva in ["si", "no"]:
        requiere = (prefiere_reserva == "si")
        if plan.get("requiere_reserva") != requiere:
            return False, "No coincide con la preferencia de reserva"

    # Horario: el plan debe contener el horario preferido
    horario = filtros.get("horario")
    if horario and horario != "indiferente":
        horarios_plan = [str(x).lower() for x in plan.get("horarios", [])]
        if str(horario).lower() not in horarios_plan:
            return False, f"No coincide con el horario: {horario}"

    # Evento especial: debe coincidir si es "si" o "no"
    prefiere_evento = filtros.get("prefiere_evento_especial")
    if prefiere_evento in ["si", "no"]:
        quiere_evento = (prefiere_evento == "si")
        if plan.get("evento_especial") != quiere_evento:
            return False, "No coincide con la preferencia de evento especial"

    # Precio: debe coincidir si no es indiferente
    precio = filtros.get("precio")
    if precio and precio != "indiferente":
        if str(plan.get("precio")).lower() != str(precio).lower():
            return False, f"No coincide con el presupuesto: {precio}"

    return True, "Aceptado"

def filtrar_planes_directo(planes, filtros):
    aceptados = []
    descartados = []

    for plan in planes:
        cumple, motivo = filtrar_plan_python(plan, filtros)

        if cumple:
            aceptados.append(plan)
        else:
            descartados.append({
                "plan": plan.get("nombre", "Sin nombre"),
                "motivo": motivo
            })

    return aceptados, descartados

@app.route("/")
def index():
    return render_template("index2.html")

@app.route("/api/tree")
def get_tree():
    try:
        nodo = cargar_json("ArbolPreferenciasTurismo.json")
        return jsonify(nodo)
    except FileNotFoundError:
        return jsonify({"error": "No se encontró el árbol de preferencias."}), 500

@app.route("/api/profiles", methods=["GET", "POST"])
def manage_profiles():
    if request.method == "GET":
        try:
            perfiles = cargar_json("perfiles_usuarios.json")
            return jsonify(perfiles)
        except FileNotFoundError:
            return jsonify({"error": "No se encontró el archivo de perfiles."}), 500
    elif request.method == "POST":
        nuevo_perfil_data = request.json
        try:
            perfiles = cargar_json("perfiles_usuarios.json")
        except FileNotFoundError:
            perfiles = []
            
        import time
        nuevo_perfil = {
            "id": f"custom_{int(time.time())}",
            "nombre": nuevo_perfil_data.get("nombre", "Perfil Personalizado"),
            "descripcion": nuevo_perfil_data.get("descripcion", "Perfil creado por el usuario."),
            "tags": nuevo_perfil_data.get("tags", {})
        }
        
        perfiles.append(nuevo_perfil)
        with open("perfiles_usuarios.json", "w", encoding="utf-8") as f:
            json.dump(perfiles, f, indent=2, ensure_ascii=False)
            
        return jsonify({"message": "Perfil creado", "perfil": nuevo_perfil}), 201

@app.route("/api/recommend", methods=["POST"])
def recommend():
    data = request.json
    codigo = data.get("codigo", "SIN_CODIGO")
    categorias = data.get("categorias", [])
    decisiones = data.get("decisiones", [])
    perfil_id = data.get("perfil_id")

    try:
        perfiles = cargar_json("perfiles_usuarios.json")
        perfil = next((p for p in perfiles if p["id"] == perfil_id), None)
        if not perfil:
            return jsonify({"error": f"No se encontró el perfil con ID {perfil_id}."}), 404
            
        filtros = perfil.get("tags", {})
    except FileNotFoundError:
        return jsonify({"error": "No se encontró el archivo perfiles_usuarios.json"}), 500

    dias_viaje = filtros.get("dias_viaje", 1)

    fecha_actual = date.today().strftime("%Y-%m-%d")
    categorias_texto = ", ".join(categorias) if categorias else "ninguna"
    decisiones_texto = " | ".join(decisiones) if decisiones else "Sin decisiones registradas"

    filtros_texto = f"""
- Idiomas: {", ".join(filtros.get('idiomas_requeridos', [])) if filtros.get('idiomas_requeridos') else 'Indiferente'}
- Requiere reserva: {filtros.get('prefiere_reserva', 'Indiferente')}
- Horario: {filtros.get('horario', 'Indiferente')}
- Evento especial: {filtros.get('prefiere_evento_especial', 'Indiferente')}
- Precio: {filtros.get('precio', 'Indiferente')}
"""

    prompt = f"""
Recomiéndame un itinerario turístico en Popayán para exactamente {dias_viaje} días que encaje con estas categorías: {categorias_texto}.
Código del perfil del árbol: {codigo}.
Decisiones tomadas por el usuario en el árbol: {decisiones_texto}.
Ten en cuenta la fecha actual {fecha_actual}, que es la fecha en la cual el usuario está visitando Popayán, Colombia.

Filtros ESTRICTOS que TODOS los planes DEBEN cumplir obligatoriamente (basados en su perfil '{perfil["nombre"]}'): {filtros_texto}
Reglas sobre los filtros: Si el filtro de reserva dice "si", en el JSON usa "requiere_reserva": true (o false si dice "no"). Si el evento especial dice "si", usa "evento_especial": true (o false si dice "no"). Si un filtro dice "Indiferente", eres libre de elegir un valor coherente.

Devuelve SOLO JSON válido con esta estructura exacta (un arreglo de días, cada día con su propio arreglo de planes):
[
  {{
    "dia": "Día 1",
    "planes": [
      {{
        "nombre": "string",
        "descripcion": "string (incluye duración si es posible)",
        "categorias": ["R", "C", "S"],
        "idiomas": ["español", "inglés"],
        "requiere_reserva": true,
        "horarios": ["mañana", "tarde"],
        "evento_especial": false,
        "tipo_evento": null,
        "precio": "bajo|medio|alto"
      }}
    ]
  }}
]

Reglas:
- Genera {dias_viaje} elemento(s) en la lista, uno para cada día (ej: "Día 1", "Día 2", etc.).
- S significa sitios turísticos
- R actividades relacionadas con religión
- C actividades culturales
- D actividades divertidas o dinámicas
- Es OBLIGATORIO usar nombres de lugares REALES y exactos de la ciudad de Popayán (ejemplos: El Morro de Tulcán, Parque Caldas, Pueblito Patojo, Rincón Payanés, Teatro Guillermo León Valencia, Catedral Basílica Nuestra Señora de la Asunción, etc.). NO inventes lugares genéricos (ej: "Paseo por el río").
- No expliques nada fuera del JSON
- Genera varias propuestas coherentes con las características dadas para cada día.
"""

    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Eres una agencia de turismo en Popayán, Colombia. "
                        "Tu tarea es recomendar planes de turismo en formato JSON válido y estructurado."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
        )

        contenido = completion.choices[0].message.content or ""
        
        texto = contenido.strip()
        if texto.startswith("```json"):
            texto = texto.replace("```json", "", 1).strip()
        elif texto.startswith("```"):
            texto = texto.replace("```", "", 1).strip()
        if texto.endswith("```"):
            texto = texto[:-3].strip()
            
        try:
            planes_por_dia = json.loads(texto)
        except json.JSONDecodeError:
            return jsonify({"error": "Groq devolvió un formato inválido.", "raw": contenido}), 500
            
        try:
            itinerario_final = []
            
            for dia_obj in planes_por_dia:
                nombre_dia = dia_obj.get("dia", "Día desconocido")
                planes_del_dia = dia_obj.get("planes", [])
                
                aceptados, _ = filtrar_planes_directo(planes_del_dia, filtros)
                
                itinerario_final.append({
                    "dia": nombre_dia,
                    "planes": aceptados
                })
                
            return jsonify({"itinerario": itinerario_final})
        except Exception as e:
            return jsonify({"error": "Error interno durante el filtrado: " + str(e)}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(port=5001, debug=True)
