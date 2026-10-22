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

## Instalación

En el prompt de una sesión de Claude Code en terminal:

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
