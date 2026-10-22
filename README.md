# claude-mods

Mods de Claude Code (function hooks) de uso propio.

## session-status

Una franja encima de la caja de texto de cada sesión con su estado en color y el título de la sesión, que se edita con un clic. Sirve para ver de un vistazo, con varias sesiones abiertas o en split view, cuál necesita tu atención.

| Estado | Cuándo |
|---|---|
| Trabajando | Hay un turno en marcha (la señal del propio motor). |
| Te necesita | Se te va a mostrar un diálogo de permiso, una pregunta o un plan para revisar. |
| En segundo plano | El turno acabó, pero quedan subagentes, workflows o comandos en marcha que despertarán la sesión. |
| Esperando tu mensaje | El turno acabó bien y no queda nada pendiente. |
| Error | El turno acabó en un error de la API o el modelo se negó. |
| Detenida | La interrumpiste. |

Los colores se configuran (hex o nombre) con `/plugin configure session-status@dsan-mods` en una terminal de Claude Code.

El título se sincroniza con el de la barra lateral de la app de escritorio. En una terminal se guarda solo para la franja.

## darcula

Aspecto Darcula de JetBrains para la conversación en la app de escritorio: cada mensaje y cada fila de herramienta va en un marco redondeado con los colores de Darcula. La fila que dibuja Claude queda dentro tal cual, con sus botones y su texto. En la terminal no cambia nada.

| Fila | Aspecto |
|---|---|
| Tus mensajes | Marco con el azul de acento. |
| Respuestas de Claude | Borde verde al pasar el ratón. |
| Herramientas | Borde del color de su tipo: comandos naranja, lecturas azul, ediciones amarillo, búsquedas morado, web verde, MCP oliva. Rojo si falla, gris si se interrumpe, azul de acento mientras corre. |
| Resultados | Sangrados bajo su llamada, con borde rojo solo si fallan. |

Opciones (`/plugin configure darcula@dsan-mods` en una terminal de Claude Code):
- `variant`: `classic` (Darcula, por defecto) o `newui` (New UI Dark).
- `background`: `tint` (fondo teñido, por defecto; se lee con la app en claro u oscuro), `solid` (los paneles oscuros de Darcula; solo con la app en modo oscuro) o `none` (solo bordes).

No puede cambiar el color del texto de Claude ni el fondo de la app, la barra lateral o la caja del prompt. No hace peticiones de red ni ejecuta nada.

## Instalación

En el prompt de una sesión de Claude Code en terminal (cambia `session-status` por `darcula` para el otro):

```
/plugin install session-status --marketplace relikks/claude-mods
```

Desde una shell:

```
claude plugin install session-status --marketplace relikks/claude-mods
```

En la app de escritorio, donde `/plugin` no funciona: pulsa + junto a la caja de texto, Plugins, Add marketplace con `relikks/claude-mods` y después Add plugin.

El repositorio es privado: solo se instala con una cuenta de GitHub que tenga acceso y con git configurado para github.com en ese equipo (una clave SSH, o `gh auth login` y luego `gh auth setup-git`).

Tras instalarlo, las sesiones nuevas lo cargan solas; en las abiertas, `/reload-plugins`.
