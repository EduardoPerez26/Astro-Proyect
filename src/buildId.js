// Identificador único por compilación (build).
// Se usa para "cache busting": cada vez que se genera el sitio (npm run build),
// este valor cambia, de modo que las URLs de los .js y .css incluyen un ?v=
// distinto y los navegadores descargan automáticamente la versión más reciente
// en lugar de reutilizar la copia en caché.
//
// Puedes fijarlo manualmente definiendo la variable de entorno BUILD_ID
// antes de compilar; si no, se genera a partir de la fecha/hora del build.
export const BUILD_ID =
  (typeof process !== "undefined" && process.env && process.env.BUILD_ID) ||
  Date.now().toString(36);
