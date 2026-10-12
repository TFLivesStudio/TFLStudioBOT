/** Audited Discord snapshot 2026-10-12, not an instruction to change the server. */
export const IDS = {
  guild: "1264656310205415474",
  admin: "1282541815802892289",
  studio: "1503797113597857893",
  roles: {
    minecraft: "1503602652330594345", websites: "1511419114399469819",
    hosting: "1503602987053088869", merch: "1548084559453888643",
    publicidad: "1516245993434124449", brillara: "1528141842686677093",
    propiedades: "1543127340635136090", tfldevs: "1559304200595316826",
    tflives: "1513732358442979459"
  },
  channels: {
    bienvenida: "1559241763896557689", normas: "1559241799271194625",
    anuncios: "1559241850316136549", guias: "1525142989494812793",
    network: "1535414989307908226", client: "1559244927345631232",
    tflweb: "1535420733151510638", webBrillara: "1559247525460971640",
    hosting: "1517346957671137310", publicidad: "1503898379728720003",
    propiedades: "1543362341973008524", merch: "1549947011778740265",
    billing: "1559259992971018330", acciones: "1503607300168876174"
  }
} as const;
export type DepartmentKey = keyof typeof DEPARTMENTS;
export const DEPARTMENTS = {
  network: { role: IDS.roles.minecraft, destination: IDS.channels.network, kind: "forum" },
  client: { role: IDS.roles.minecraft, destination: IDS.channels.client, kind: "forum" },
  tflweb: { role: IDS.roles.websites, destination: IDS.channels.tflweb, kind: "forum" },
  webBrillara: { role: IDS.roles.websites, destination: IDS.channels.webBrillara, kind: "forum" },
  hosting: { role: IDS.roles.hosting, destination: IDS.channels.hosting, kind: "text" },
  publicidad: { role: IDS.roles.publicidad, destination: IDS.channels.publicidad, kind: "text" },
  propiedades: { role: IDS.roles.propiedades, destination: IDS.channels.propiedades, kind: "text" },
  merch: { role: IDS.roles.merch, destination: IDS.channels.merch, kind: "text" }
} as const;
export const NETWORK_TAGS = {
  UPDATE: "1535415172674621460",
  AVANCE: "1535415199115386940",
  IDEA: "1535415228328841226",
  Global: "1553837525376962581"
} as const;
