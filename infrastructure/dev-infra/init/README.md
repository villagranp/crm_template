# init/

Scripts SQL que PostgreSQL ejecuta **solo la primera vez** que se crea el
volumen de datos. Sirven para dejar listas las bases de los proyectos que ya
existen cuando alguien monta la máquina desde cero.

Un script que se añade después **no se ejecuta** sobre un volumen que ya existe.
Para dar de alta la base de un proyecto nuevo, usa el comando manual del
`README.md` de la carpeta superior.

No pongas aquí nada específico de un proyecto más allá del alta de su base y su
usuario: el esquema lo crean las migraciones de Prisma, no un script suelto.
