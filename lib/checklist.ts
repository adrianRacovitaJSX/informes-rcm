// Puntos a revisar en un vehículo usado. Fuente única de verdad para la app y el PDF.

export type ItemStatus = "ok" | "atencion" | "mal" | "na"

export type ExtraField = {
  key: string
  label: string
  type: "text" | "number" | "select"
  options?: string[]
  unit?: string
}

export type ChecklistItem = {
  id: string
  label: string
  hint?: string
  extras?: ExtraField[]
}

export type ChecklistSection = {
  id: string
  title: string
  short: string
  intro?: string
  items: ChecklistItem[]
}

export const STATUS_META: Record<ItemStatus, { label: string; short: string; color: string; hex: string }> = {
  ok: { label: "Correcto", short: "OK", color: "emerald", hex: "#16a34a" },
  atencion: { label: "Atención", short: "Atención", color: "amber", hex: "#d97706" },
  mal: { label: "Mal", short: "Mal", color: "red", hex: "#dc2626" },
  na: { label: "No aplica", short: "N/A", color: "zinc", hex: "#71717a" },
}

export const CHECKLIST: ChecklistSection[] = [
  {
    id: "motor",
    title: "Motor",
    short: "Motor",
    items: [
      { id: "juntas_motor", label: "Juntas del motor", hint: "Buscar fugas o sudados de aceite en juntas y tapa de balancines." },
      {
        id: "tapon_aceite",
        label: "Tapón de aceite y árbol de levas",
        hint: "Abrir el tapón y ver que las piezas del árbol de levas no estén rayadas ni quemadas y que el aceite esté bien, no como mousse.",
      },
      {
        id: "correas",
        label: "Correas (sobre todo distribución)",
        hint: "Pedir facturas de cuándo se ha cambiado la distribución.",
        extras: [
          { key: "ultimo_cambio", label: "Último cambio (fecha / km)", type: "text" },
          { key: "factura", label: "¿Hay factura?", type: "select", options: ["Sí", "No", "Sin datos"] },
        ],
      },
      { id: "nivel_aceite", label: "Nivel de aceite" },
      { id: "manguitos", label: "Manguitos", hint: "Sin grietas, hinchazones ni fugas." },
      { id: "deposito_anticongelante", label: "Depósito de anticongelante", hint: "Ver el líquido y las paredes del depósito." },
      { id: "arranque_ruidos", label: "Arranque y ruidos", hint: "Arrancar y escuchar que no haya ruidos raros." },
      {
        id: "humo_escape",
        label: "Humo del escape",
        hint: "Blanco: quema agua · Negro: mala inyección · Azul: quema aceite.",
        extras: [{ key: "color", label: "Color del humo", type: "select", options: ["Ninguno", "Blanco", "Negro", "Azul"] }],
      },
      { id: "varilla_aceite", label: "Varilla de aceite", hint: "Levantar la varilla y comprobar que no salga humo ni escupa aceite." },
      { id: "embrague", label: "Embrague", hint: "Punto de agarre, patinado y ruidos." },
      { id: "liquido_direccion", label: "Líquido de dirección", hint: "Que esté en su nivel y tenga buen color." },
      { id: "direccion", label: "Dirección", hint: "Holguras, ruidos y dureza." },
      { id: "luces_cuadro", label: "Testigos del cuadro", hint: "Ningún testigo de avería encendido tras arrancar." },
      {
        id: "maquina_diagnosis",
        label: "Máquina de diagnosis",
        hint: "Conectar la máquina y revisar errores almacenados.",
        extras: [{ key: "errores", label: "Códigos de error", type: "text" }],
      },
      {
        id: "liquido_frenos",
        label: "Líquido de frenos, frenos y discos",
        hint: "Nivel y color del líquido, respuesta del pedal y estado de los discos de freno: desgaste, surcos y labio en el borde.",
      },
      {
        id: "alternador",
        label: "Alternador",
        hint: "Arrancado ~13,5 V · Parado ~12,5 V.",
        extras: [
          { key: "v_arrancado", label: "Voltaje arrancado", type: "number", unit: "V" },
          { key: "v_parado", label: "Voltaje parado", type: "number", unit: "V" },
        ],
      },
      { id: "radiadores", label: "Radiadores", hint: "Que no viertan ni estén chapuceados." },
      {
        id: "silentblocks",
        label: "Silentblocks de motor y caja de cambios",
        hint: "Sin gomas agrietadas ni despegadas. Al acelerar y soltar en parado, el motor no debe dar golpes ni moverse en exceso.",
      },
      {
        id: "bujias",
        label: "Bujías",
        hint: "Sacar y ver todas. Negra: inyectores, filtros, caudalímetro · Con aceite: segmentos, retenes de válvulas, guías · Oxidada: pasa agua a los pistones (culata).",
        extras: [{ key: "estado", label: "Estado", type: "select", options: ["Correctas", "Negras", "Con aceite", "Oxidadas"] }],
      },
    ],
  },
  {
    id: "conduccion",
    title: "Conducción",
    short: "Conducción",
    intro: "Que no vibre a gran velocidad ni al frenar bruscamente, y al soltar el volante que no se vaya hacia los lados en las curvas forzadas. Que no suene ni haga cosas raras.",
    items: [
      { id: "vibraciones", label: "Vibraciones a gran velocidad" },
      { id: "frenada_brusca", label: "Frenada brusca", hint: "Sin vibraciones ni desvíos al frenar fuerte." },
      { id: "curvas_forzadas", label: "Curvas forzadas", hint: "Sin ruidos ni comportamientos extraños." },
      { id: "recto_volante", label: "Se mantiene recto al soltar el volante" },
      { id: "ruidos_conduccion", label: "Ruidos o cosas raras en marcha" },
    ],
  },
  {
    id: "interior",
    title: "Aparatos e interior",
    short: "Interior",
    items: [
      { id: "aire_acondicionado", label: "Aire acondicionado", hint: "Que funcione y enfríe." },
      {
        id: "compresor_electroventilador",
        label: "Compresor y electroventilador",
        hint: "Que salte el compresor al encender el A/C y el electroventilador. Que no se caliente el motor.",
      },
      { id: "caja_cambios", label: "Caja de cambios", hint: "Entrada de marchas, ruidos y saltos." },
      { id: "cuadro", label: "Cuadro de instrumentos", hint: "Que estén todas las agujas y números en su sitio." },
      { id: "desgaste", label: "Desgaste de volante, pomo, pedales, asiento y cinturón", hint: "Coherente con los kilómetros declarados." },
      { id: "asientos", label: "Asientos", hint: "Regulaciones, anclajes y estado de la tapicería." },
      { id: "puertas_int", label: "Puertas (interior y cierres)" },
      { id: "elevalunas", label: "Elevalunas" },
      { id: "espejos", label: "Espejos" },
      {
        id: "camaras_sensores",
        label: "Cámaras y sensores de aparcamiento",
        hint: "Que la cámara se vea nítida y todos los sensores avisen al acercarse a un obstáculo.",
      },
      {
        id: "extras_homologados",
        label: "Extras homologados",
        hint: "Lunas tintadas, bola de remolque, etc. deben constar en la ficha técnica.",
      },
    ],
  },
  {
    id: "exterior",
    title: "Revisión exterior",
    short: "Exterior",
    items: [
      { id: "puertas_ext", label: "Puertas", hint: "Que cuadren bien." },
      { id: "maletero", label: "Maletero", hint: "Que cuadre bien." },
      {
        id: "porton_electrico",
        label: "Portón de maletero eléctrico",
        hint: "Si es eléctrico: que abra y cierre del todo, sin tirones ni ruidos, desde el botón y desde la llave. Si no lo es, marcar No aplica.",
      },
      { id: "capo", label: "Capó", hint: "Que cuadre bien." },
      { id: "paragolpes", label: "Paragolpes", hint: "Que cuadren bien." },
      { id: "pilotos_faros_ajuste", label: "Pilotos y faros (ajuste)", hint: "Que cuadren bien." },
      { id: "chapa", label: "Chapa", hint: "Revisar al trasluz bollitos y roces; conocer el cuidado que ha tenido el coche." },
      { id: "llantas", label: "Llantas", hint: "Roces, golpes y deformaciones." },
      { id: "pegatinas", label: "Pegatinas" },
      { id: "embellecedores", label: "Embellecedores" },
      { id: "modificaciones", label: "Modificaciones estéticas" },
      { id: "pintura", label: "Pintura", hint: "Comprobar los cambios de color de una pieza a otra." },
      { id: "suspension", label: "Suspensión", hint: "Que retenga bien y no haga rebote." },
      { id: "retrovisores", label: "Retrovisores" },
      {
        id: "faros_golpes",
        label: "Faros y golpes frontales",
        hint: "Que no haya tenido golpes frontales: mirar los faros, sus anclajes y el chasis que se ve al abrir el capó.",
      },
      { id: "techo_solar", label: "Techo solar", hint: "Que no entre agua, mirando la moqueta que lo rodea." },
      {
        id: "neumaticos",
        label: "Neumáticos",
        extras: [
          { key: "dot", label: "Fecha fabricación (DOT)", type: "text" },
          { key: "profundidad", label: "Profundidad mínima", type: "number", unit: "mm" },
        ],
      },
      { id: "chasis_bajo", label: "Chasis bajo", hint: "Que no tenga agujeros ni óxido, pilares doblados ni abolladuras." },
    ],
  },
]

export const ALL_ITEMS: ChecklistItem[] = CHECKLIST.flatMap((s) => s.items)
export const TOTAL_ITEMS = ALL_ITEMS.length

export function findItem(id: string) {
  return ALL_ITEMS.find((i) => i.id === id)
}

export function findSectionOf(itemId: string) {
  return CHECKLIST.find((s) => s.items.some((i) => i.id === itemId))
}
