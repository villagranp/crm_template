# Alcance funcional del CRM comercial — documento fuente

> Entregado por el responsable del proyecto el 2026-10-10. Es la **fuente del
> alcance funcional completo** del CRM. Se conserva literal; las
> especificaciones de `docs/implementation-plans/crm/` lo desarrollan y la
> matriz de trazabilidad verifica que no se pierda ninguna funcionalidad.
> Las decisiones que este documento deja abiertas se registran en
> `docs/implementation-plans/crm/decisiones-pendientes.md`.

---

# PROMPT MAESTRO — DEFINICIÓN FUNCIONAL E IMPLEMENTACIÓN DE CRM COMERCIAL

## 1. Objetivo

Necesito desarrollar un CRM comercial compuesto por **7 módulos funcionales**, utilizando la plantilla y arquitectura de desarrollo que ya existen en este repositorio.

Tu responsabilidad es analizar el proyecto, comprender su estructura actual y generar los archivos de especificación e implementación necesarios para desarrollar cada módulo de manera independiente, conservando todas las relaciones funcionales y de datos entre ellos.

**No debes redefinir la arquitectura, tecnologías, estándares de programación, autenticación, componentes base ni convenciones que ya estén establecidos en el proyecto, AGENTS.md o sus skills.**

Este documento establece exclusivamente el alcance funcional del CRM y las reglas que deben respetarse durante su implementación.

### Reglas fundamentales

1. Los siete módulos deben compartir un modelo de datos relacional consistente, utilizando Prisma.
2. El modelo de datos completo debe prepararse antes de comenzar la implementación de las funcionalidades.
3. Cada módulo se implementará individualmente, sin generar simultáneamente las funcionalidades de otros módulos.
4. Deben conservarse todas las relaciones y dependencias entre módulos, aunque estos todavía no estén implementados.
5. Las tablas de datos maestros, catálogos, usuarios, roles y parámetros deben existir desde el inicio.
6. Durante las primeras fases, los datos maestros se cargarán directamente a la base de datos mediante seeds o scripts versionados.
7. **Los mantenimientos administrativos de catálogos, usuarios, roles y parámetros serán lo último en desarrollarse.**
8. Los formularios deben utilizar los datos maestros almacenados en la base de datos, nunca listas de valores fijas en el frontend.
9. Deben implementarse todas las funcionalidades detalladas a continuación. Ninguna pantalla, campo, validación o proceso debe excluirse silenciosamente.
10. No agregar integraciones con sistemas externos que no estén incluidas expresamente en el alcance.

---

# 2. Preparación del modelo de datos

Antes de desarrollar las funcionalidades, debes construir o adaptar el esquema Prisma existente para cubrir todos los procesos del CRM.

El modelo debe contemplar:

- Usuarios, equipos comerciales, países, roles y permisos.
- Clientes y contactos.
- Proyectos y clasificación.
- Fases de clientes e historial de cambios.
- Oportunidades comerciales, etapas y resultados.
- Productos, familias, unidades y asociaciones comerciales.
- Forecast de seis meses.
- Visitas y sus eventos.
- Actividades e interacciones comerciales.
- Archivos adjuntos.
- Importaciones de clientes y resultados por registro.
- Catálogos y parámetros generales.
- Auditoría e historial de modificaciones.

Todas las entidades deben compartir identificadores y referencias consistentes.

### Relaciones funcionales obligatorias

- Un cliente puede tener múltiples contactos.
- Un cliente puede tener múltiples proyectos.
- Un proyecto pertenece a un cliente.
- Un proyecto tiene un asesor responsable.
- Un proyecto puede tener múltiples oportunidades.
- Un proyecto tiene una fase de avance del cliente independiente de sus oportunidades.
- Una oportunidad puede tener productos asociados y un resultado comercial.
- Un proyecto puede tener múltiples productos asociados.
- El forecast se relaciona con proyecto, producto, período y asesor.
- Una visita se relaciona con un cliente y opcionalmente con un proyecto.
- Una actividad se relaciona con un cliente y opcionalmente con proyecto u oportunidad.
- Las visitas y actividades generan información de seguimiento e historial de interacciones.
- Los usuarios pueden pertenecer a equipos y ámbitos comerciales autorizados.
- Los roles determinan permisos y los ámbitos determinan visibilidad.
- Los catálogos suministran los valores utilizados por los formularios.
- La auditoría relaciona las operaciones realizadas con el usuario responsable.

No duplicar entidades maestras para resolver relaciones entre módulos.

Crear las restricciones necesarias para proteger la integridad de los datos.

## 2.1 Datos maestros iniciales

Preparar cargas iniciales para:

- Países.
- Equipos.
- Usuarios de demostración.
- Roles y permisos.
- Tipos, estados y calificaciones de clientes.
- Tipos y sectores de proyectos.
- Fases del cliente.
- Etapas comerciales.
- Resultados y motivos comerciales.
- Familias y productos.
- Unidades de medida.
- Reglas de conversión de unidades.
- Tipos de actividades.
- Estados de actividades y visitas.
- Prioridades.
- Parámetros de alertas y vencimientos.

Crear datos ficticios coherentes para demostrar:

- Clientes y contactos.
- Proyectos con diferentes fases.
- Oportunidades abiertas, ganadas, perdidas y parciales.
- Productos asociados.
- Forecast M+6.
- Visitas programadas, realizadas, reprogramadas y canceladas.
- Actividades pendientes, completadas y vencidas.
- Historiales e interacciones comerciales.

Los seeds deben ser idempotentes y deben separar la configuración esencial de los datos de demostración.

Los datos de demostración no deben cargarse en producción.

---

# 3. MÓDULO 1 — INICIO / DASHBOARD

## 3.1 Dashboard general

Implementar la pantalla principal que se presenta después de que el usuario se autentica.

Debe mostrar:

- Usuario autenticado.
- Nombre del usuario.
- Rol.
- Fecha y hora.
- Navegación general del CRM.
- Accesos rápidos a funcionalidades frecuentes.
- Accesos disponibles de acuerdo con los permisos del usuario.

La pantalla debe adaptar su contenido al perfil y ámbito de visibilidad autorizado.

### Funcionalidad esperada

El usuario debe poder acceder desde el Dashboard a los registros y funcionalidades para los que tenga permisos.

Los accesos rápidos deben navegar a las pantallas correspondientes.

No mostrar accesos a funcionalidades no autorizadas.

## 3.2 Indicadores clave

Implementar tarjetas de indicadores comerciales para:

- Proyectos activos.
- Oportunidades abiertas.
- Oportunidades ganadas.
- Oportunidades perdidas.
- Forecast comercial de los próximos seis meses.
- Visitas pendientes y próximas.
- Actividades pendientes.
- Actividades vencidas.
- Metas comerciales y cumplimiento, cuando existan metas configuradas.

Los indicadores deben calcularse utilizando los registros reales del CRM.

Cada tarjeta debe permitir consultar los registros relacionados o navegar hacia el listado correspondiente con el filtro aplicado.

Las métricas deben respetar la visibilidad del usuario.

Los criterios de cálculo deben ser consistentes con el Módulo de Reportes.

No inventar valores ni metas cuando no exista información.

## 3.3 Resumen de actividad

Implementar un panel de actividad reciente.

Debe mostrar:

- Actividades comerciales recientes.
- Próximas visitas.
- Últimas interacciones con clientes.
- Oportunidades recientemente modificadas.
- Actualizaciones relevantes de proyectos.

Mostrar fecha, tipo, responsable, cliente/proyecto relacionado y resumen.

Ordenar cronológicamente.

Cada evento debe permitir navegar a su registro de origen, sujeto a permisos.

## 3.4 Alertas y pendientes

Implementar una bandeja de alertas comerciales que identifique:

- Actividades vencidas.
- Visitas realizadas pendientes de confirmación.
- Proyectos que no han recibido actualizaciones dentro del período establecido.
- Oportunidades abiertas sin siguiente acción definida.

Cada alerta debe incluir:

- Tipo.
- Descripción.
- Prioridad.
- Responsable.
- Fecha de referencia.
- Registro relacionado.
- Acceso al registro de origen.

Las reglas de generación, vencimiento y prioridad deben obtenerse de parámetros configurables.

No generar alertas duplicadas para una misma condición.

Las alertas deben actualizarse cuando cambie la información de origen.

### Relaciones del módulo

Este módulo consume información de Clientes, Proyectos, Actividad Comercial y Administración.

Comparte definiciones de indicadores con Reportes.

No debe convertirse en propietario de los registros comerciales.

---

# 4. MÓDULO 2 — CLIENTES / CUENTAS

## 4.1 Búsqueda de clientes

Implementar una pantalla de búsqueda de clientes registrados localmente en el CRM.

Permitir filtros combinables por:

- Código de cliente.
- Código interno CRM.
- Razón social.
- País.
- Ciudad.
- Estado.
- Responsable de ventas.

El listado debe permitir:

- Búsqueda.
- Filtros.
- Ordenamiento.
- Paginación.
- Selección de un cliente.
- Navegación hacia su ficha.

**No implementar integración con SAP para consultar clientes.**

## 4.2 Creación de clientes

Implementar el formulario de registro.

Campos:

- Código de cliente.
- Identificador interno CRM generado automáticamente.
- Razón social.
- Nombre comercial.
- País.
- Ciudad.
- Dirección.
- Teléfono.
- Correo electrónico.
- Tipo de empresa.
- Estado.
- Calificación.
- Responsable de ventas.
- NIT.
- Archivos adjuntos.

### Reglas

- Generar identificador único.
- Validar campos obligatorios.
- Validar correo y teléfono.
- Verificar duplicados antes de guardar.
- Validar código de cliente y NIT conforme a las reglas de unicidad configuradas.
- Validar la existencia del asesor responsable.
- Obtener los valores seleccionables de los catálogos.
- Registrar usuario y fecha de creación.
- Mantener auditoría de modificaciones relevantes.

## 4.3 Ficha del cliente

Implementar una ficha detallada con toda la información general y comercial de la cuenta.

Debe permitir:

- Consultar.
- Editar.
- Eliminar, únicamente cuando el rol lo permita.
- Administrar adjuntos.
- Consultar contactos.
- Consultar proyectos relacionados.

La eliminación debe respetar las relaciones existentes y no eliminar información histórica asociada.

Aplicar desactivación lógica cuando corresponda.

Los campos editables deben depender de los permisos del usuario.

## 4.4 Proyectos asociados al cliente

Agregar a la ficha una sección que muestre los proyectos relacionados.

Campos:

- Código de proyecto.
- Nombre.
- Ubicación.
- Fase.
- Oportunidad o estado comercial.
- Asesor responsable.
- Fecha estimada de decisión.

Permitir:

- Buscar.
- Filtrar.
- Ordenar.
- Navegar al detalle del proyecto.

Mostrar únicamente los proyectos autorizados para el usuario.

Esta sección debe consultar el Módulo de Proyectos. No debe administrar ni duplicar sus registros.

## 4.5 Contactos

Implementar la administración de contactos dentro del cliente.

Campos:

- Nombre.
- Apellidos.
- Cargo.
- Teléfono.
- Correo electrónico.
- Cliente.
- Indicador de contacto principal.
- Estado.
- Comentarios.

Funcionalidades:

- Crear contacto.
- Consultar contactos.
- Editar contacto.
- Eliminar o desactivar contacto conforme a permisos.
- Seleccionar contacto principal.
- Mostrar contactos dentro de la ficha del cliente.

### Reglas

- Todo contacto debe pertenecer a un cliente válido.
- Validar correo y teléfono.
- Evitar duplicidad según las reglas definidas.
- Mantener como máximo un contacto principal activo por cliente.
- Proteger los contactos relacionados con registros históricos.

### Relaciones del módulo

Clientes es propietario de las cuentas y contactos.

Proyectos debe utilizar su identificador de cliente.

Actividad Comercial debe utilizar las mismas cuentas y contactos para registrar visitas e interacciones.

Reportes e Inicio deben consultar los clientes sin duplicar su información.

Integraciones debe utilizar las mismas reglas de validación y creación de clientes.

---

# 5. MÓDULO 3 — PROYECTOS

Este módulo constituye el núcleo de la operación comercial.

Todas las siguientes secciones pertenecen al Módulo de Proyectos y deben funcionar de forma relacionada.

## 5.1 Crear proyecto

Implementar un formulario con:

- Identificador único.
- Código de proyecto.
- Nombre.
- Cliente.
- País.
- Ciudad o ubicación.
- Dirección.
- Descripción.
- Fechas estimadas.
- Fecha estimada de decisión.
- Asesor responsable.
- Archivos adjuntos.

### Reglas

- Generar identificador único.
- Exigir cliente válido.
- Validar los campos obligatorios.
- Validar coherencia entre fechas.
- Asociar el asesor responsable.
- Registrar fecha y usuario de creación.
- Permitir agregar documentación.

## 5.2 Consultar y editar proyectos

Implementar una ficha organizada por secciones:

- Información general.
- Clasificación.
- Fase del cliente.
- Oportunidades.
- Resultados.
- Productos asociados.
- Forecast.
- Seguimiento comercial.
- Adjuntos.
- Historial de cambios.

Permitir consultar y editar de acuerdo con el rol y permisos.

Registrar auditoría de las modificaciones relevantes.

## 5.3 Duplicar proyecto

Permitir crear un nuevo proyecto a partir de uno existente.

Permitir reutilizar datos generales seleccionados.

Solicitar o confirmar:

- Nuevo nombre o código.
- Cliente.
- Fechas.
- Asesor responsable.

Generar un nuevo identificador.

No copiar automáticamente:

- Resultados comerciales anteriores.
- Visitas realizadas.
- Actividades históricas.
- Auditoría.
- Confirmaciones.
- Forecast como información confirmada del nuevo proyecto.

## 5.4 Buscar proyectos

Implementar filtros combinables por:

- Nombre.
- Código.
- Cliente.
- País.
- Ciudad o ubicación.
- Asesor.
- Tipo de proyecto.
- Fase.
- Etapa de oportunidad.
- Fechas.

Incluir ordenamiento, paginación y navegación al detalle.

## 5.5 Visualización de proyectos del equipo

Permitir la consulta compartida de proyectos según el perfil del usuario.

Contemplar:

- Asesor comercial.
- Jefe.
- Supervisor.
- Responsable de país.
- Administrador.

Mostrar:

- Proyecto.
- Cliente.
- Responsable.
- Equipo.
- Estado o fase.
- Última actualización.

Distinguir visibilidad de permisos de edición.

Un usuario autorizado para consultar proyectos del equipo no necesariamente debe poder modificarlos.

## 5.6 Clasificación de proyectos

Permitir clasificar los proyectos mediante:

- Tipo de proyecto.
- Sector o uso.
- Unidad de medida.
- Regla de conversión o estimación de tonelaje.

Utilizar catálogos configurables.

Las reglas de conversión deben asociarse a las unidades y tipos correspondientes.

No implementar factores de conversión fijos en formularios o componentes.

Validar que las conversiones aplicadas sean válidas.

## 5.7 Fase del cliente

Implementar las fases:

- Diseño.
- Cotización.
- Construcción.
- Finalizado.

Campos:

- Fase actual.
- Porcentaje de avance.
- Fecha de actualización.
- Comentario.

Validar que el porcentaje esté entre 0 y 100.

Registrar historial de cambios.

**La fase del cliente debe mantenerse independiente de la etapa comercial de las oportunidades.**

Un proyecto puede encontrarse en construcción y mantener oportunidades comerciales abiertas.

## 5.8 Oportunidades comerciales

Implementar el pipeline comercial con las etapas:

- Contactado.
- Cotizando.
- Ganado.
- Perdido.

Campos:

- Identificador de oportunidad.
- Proyecto relacionado.
- Etapa.
- Fecha.
- Asesor.
- Estimación.
- Siguiente acción.

Permitir:

- Crear oportunidades.
- Consultarlas.
- Editarlas.
- Cambiar etapas.
- Filtrar por etapa y asesor.
- Registrar historial de cambios.

Un proyecto puede tener múltiples oportunidades.

Validar transiciones entre etapas.

La etapa comercial no debe modificar automáticamente la fase del cliente.

## 5.9 Resultado de oportunidades

Implementar resultados:

- Ganado.
- Perdido.
- Parcial.

Campos:

- Resultado.
- Motivo.
- Porcentaje adjudicado.
- Fecha de decisión.
- Comentarios.

Reglas:

- Exigir motivo cuando se registre como perdido.
- Exigir porcentaje adjudicado cuando el resultado sea parcial.
- Validar porcentaje entre 0 y 100.
- Registrar fecha de decisión.
- Auditar cambios de resultado.

El resultado parcial no debe generar automáticamente una nueva etapa del pipeline.

## 5.10 Productos asociados

Implementar la relación de productos con proyectos y oportunidades.

Campos:

- Código de material o SKU.
- Descripción.
- Familia.
- Unidad de medida.
- Cantidad.
- Tonelaje.
- Estado.
- Proyecto asociado.
- Oportunidad asociada, cuando corresponda.

Permitir:

- Buscar productos del catálogo local.
- Seleccionar productos.
- Asociarlos con proyectos.
- Asociarlos con oportunidades.
- Registrar cantidades y tonelajes.
- Editar asociaciones.
- Consultar productos dentro de la ficha del proyecto.

La información maestra del producto debe mantenerse separada de las cantidades comerciales asociadas.

## 5.11 Forecast comercial M+6

Implementar una matriz editable para los próximos seis meses:

- M+1.
- M+2.
- M+3.
- M+4.
- M+5.
- M+6.

Campos:

- Proyecto.
- Producto.
- Año.
- Mes.
- Cantidad proyectada.
- Unidad de medida.
- Tonelaje.
- Asesor responsable.
- Fecha de actualización.

### Funcionalidades

- Registrar proyecciones mensuales.
- Editar cantidades.
- Calcular tonelajes.
- Mostrar totales por período.
- Calcular total acumulado.
- Filtrar por proyecto.
- Filtrar por producto.
- Filtrar por asesor.
- Filtrar por mes.
- Consultar fecha de actualización.
- Mostrar forecast en la ficha del proyecto.

### Reglas

- Mantener una línea única por proyecto, producto, año y mes.
- Evitar duplicados.
- No permitir cantidades negativas.
- Utilizar las reglas de conversión disponibles.
- No sumar unidades incompatibles.
- Mantener una ventana móvil de seis meses.
- No eliminar datos históricos al cambiar de período.
- Auditar cambios relevantes.

### Relaciones del módulo

Proyectos consume Clientes, Usuarios, Productos y Catálogos.

Actividad Comercial debe poder relacionar visitas y actividades con proyectos y oportunidades.

Inicio y Reportes deben utilizar sus estados, etapas, resultados, productos y forecast.

---

# 6. MÓDULO 4 — ACTIVIDAD COMERCIAL

## 6.1 Agenda general

Implementar una agenda comercial disponible en:

- Vista calendario.
- Vista listado.

Mostrar:

- Fecha y hora.
- Responsable.
- Tipo de actividad.
- Cliente.
- Proyecto.
- Estado.
- Asunto.
- Adjuntos relacionados.

Permitir filtros por:

- Fecha.
- Asesor.
- País.
- Tipo de actividad.
- Estado.

Cada evento debe permitir navegar a su detalle.

Respetar permisos de visibilidad.

## 6.2 Actividades pendientes

Implementar una bandeja de actividades que requieren seguimiento.

Mostrar:

- Actividad.
- Fecha de vencimiento.
- Prioridad.
- Responsable.
- Cliente.
- Proyecto.
- Estado.

Identificar:

- Pendientes.
- Vencidas.
- Próximas a vencer.

Ordenar por prioridad y vencimiento.

Las actividades completadas no deben continuar apareciendo como pendientes.

## 6.3 Seguimiento comercial

Implementar una vista de seguimiento por cliente y proyecto.

Mostrar:

- Última interacción.
- Próxima acción.
- Responsable.
- Fecha de próxima acción.
- Notas.
- Archivos adjuntos.

Debe permitir consultar la trazabilidad de las gestiones comerciales.

La información debe provenir de las visitas y actividades registradas, sin generar duplicaciones.

## 6.4 Historial de interacciones

Implementar un historial cronológico de todas las interacciones comerciales.

Campos:

- Fecha.
- Tipo.
- Usuario.
- Cliente.
- Proyecto.
- Resumen.
- Resultado.
- Actividad o visita relacionada.

Mostrar los eventos ordenados cronológicamente.

Permitir consultar el registro de origen.

Evitar duplicar eventos históricos.

## 6.5 Visitas comerciales

Implementar la gestión de visitas relacionada con clientes y proyectos.

Campos generales:

- Cliente.
- Proyecto.
- Fecha y hora.
- Asesor responsable.
- Objetivo.
- Participantes.
- Ubicación.
- Estado.
- Resultado.
- Comentarios.
- Archivos adjuntos.

### 6.5.1 Planificar visita

Permitir registrar:

- Fecha y hora.
- Cliente.
- Proyecto.
- Responsable.
- Objetivo.
- Ubicación.
- Recordatorio.
- Adjuntos.

Validar los campos obligatorios.

Preparar la validación de conflictos horarios del asesor, sin bloquear automáticamente hasta que se confirme la regla de negocio.

### 6.5.2 Registrar visita realizada

Capturar:

- Fecha real.
- Asistentes.
- Temas tratados.
- Acuerdos.
- Resultado.
- Comentarios.
- Próxima acción.
- Archivos adjuntos.

Registrar el usuario que ingresa la información.

Actualizar el seguimiento comercial.

### 6.5.3 Confirmar visita

Permitir confirmar la realización de una visita.

Registrar:

- Estado.
- Fecha de confirmación.
- Usuario.
- Resultado o resumen.
- Adjuntos.

Exigir información mínima del resultado o comentarios.

Actualizar la agenda y los indicadores relacionados.

### 6.5.4 Reprogramar o cancelar

Permitir reprogramar y cancelar visitas.

Registrar:

- Motivo.
- Nueva fecha y hora, cuando aplique.
- Usuario.
- Fecha del cambio.
- Estado anterior.
- Estado nuevo.
- Adjuntos.

Conservar el historial.

No eliminar físicamente las visitas canceladas.

Actualizar su representación en la agenda.

## 6.6 Actividades comerciales

Implementar una entidad de actividad que soporte:

- Llamadas.
- Reuniones.
- Correos electrónicos.
- Tareas comerciales.

Campos generales:

- Tipo.
- Asunto.
- Descripción.
- Cliente.
- Proyecto.
- Responsable.
- Fecha y hora.
- Fecha de vencimiento.
- Estado.
- Prioridad.
- Resultado.
- Adjuntos.

Los tipos y estados deben obtenerse de catálogos.

### 6.6.1 Crear actividad

Permitir crear actividades desde:

- Menú de Actividad Comercial.
- Ficha del cliente.
- Ficha de proyecto.

Cuando se cree desde una ficha, preseleccionar el cliente o proyecto correspondiente.

Validar las relaciones.

### 6.6.2 Llamadas, reuniones y correos

Implementar formularios que muestren campos específicos según el tipo.

Campos:

- Fecha.
- Duración.
- Participantes.
- Resumen.
- Resultado.
- Siguiente acción.
- Adjuntos.

Registrar cada gestión en el historial de interacciones.

No implementar envío o recepción real de correos sin un alcance adicional.

### 6.6.3 Confirmar realización

Permitir completar actividades.

Registrar:

- Estado.
- Fecha de finalización.
- Resultado.
- Comentarios.
- Usuario.
- Adjuntos.

Exigir resultado para completar.

Actualizar:

- Pendientes.
- Agenda.
- Historial.
- Indicadores del Dashboard.

### Relaciones del módulo

Actividad Comercial consume Clientes, Contactos, Proyectos, Oportunidades y Usuarios.

Proporciona historial, visitas, tareas y pendientes a Inicio y Reportes.

Las visitas y actividades deben conservar sus identificadores e historiales independientemente del módulo desde el que se consulten.

---

# 7. MÓDULO 5 — REPORTES

Todos los reportes deben generarse utilizando los datos del CRM.

No integrar Power BI ni otros servicios externos de BI.

## 7.1 Reporte de proyectos

Implementar un reporte con:

- Código de proyecto.
- Nombre.
- Cliente.
- País.
- Ubicación.
- Asesor.
- Tipo.
- Fase.
- Porcentaje de avance.
- Estado comercial.
- Fecha estimada de decisión.
- Última actualización.

Permitir filtros, ordenamiento, paginación y navegación al detalle.

## 7.2 Reporte de oportunidades

Mostrar:

- Proyecto.
- Cliente.
- Asesor.
- Etapa.
- Resultado.
- Estimación.
- Fecha de decisión.
- Fecha de actualización.

Incluir conteos de:

- Oportunidades abiertas.
- Oportunidades ganadas.
- Oportunidades perdidas.
- Resultados parciales.
- Distribución por etapa.
- Distribución por asesor.

Permitir filtros por período, asesor, cliente y estado.

Definir correctamente los criterios de oportunidad abierta y cerrada.

Evitar duplicar oportunidades al consultar sus productos asociados.

## 7.3 Reporte de forecast

Mostrar:

- Proyecto.
- Cliente.
- Producto.
- Familia.
- Año.
- Mes.
- Cantidad.
- Unidad.
- Tonelaje.
- Asesor.
- Fecha de actualización.

Permitir consolidar por:

- Mes.
- Producto.
- Familia.
- Proyecto.
- Cliente.
- Asesor.

Incluir totales mensuales y acumulados.

Respetar las unidades de medida.

Mostrar la última actualización de las proyecciones.

## 7.4 Reporte de visitas

Mostrar:

- Cliente.
- Proyecto.
- Asesor.
- Fecha planificada.
- Fecha real.
- Estado.
- Resultado.
- Fecha de confirmación.

Permitir filtros por:

- Período.
- Asesor.
- Estado.
- Cliente.
- País.

Diferenciar visitas programadas, realizadas, confirmadas y canceladas.

No duplicar visitas reprogramadas.

## 7.5 Reporte de actividades

Mostrar:

- Tipo.
- Asunto.
- Cliente.
- Proyecto.
- Responsable.
- Fecha.
- Vencimiento.
- Prioridad.
- Estado.
- Resultado.

Permitir filtros por:

- Período.
- Asesor.
- Estado.
- Cliente.
- Tipo de actividad.

Incluir conteos de actividades pendientes, realizadas y vencidas.

## 7.6 Exportación a Excel

Permitir exportar los resultados de los reportes a Excel.

La exportación debe:

- Respetar filtros.
- Respetar permisos.
- Mantener encabezados.
- Mantener formatos de fecha.
- Mantener formatos numéricos.
- Mantener unidades y cantidades.
- Incluir el conjunto completo de registros filtrados y autorizados.

No exportar información a la que el usuario no tiene acceso.

## 7.7 Dashboard comercial

Implementar un tablero analítico dentro del módulo.

Mostrar visualizaciones de:

- Proyectos activos.
- Oportunidades por etapa.
- Resultados ganados y perdidos.
- Forecast por mes.
- Distribución por asesor.
- Actividades y visitas comerciales.
- Tendencias de los indicadores disponibles.

Permitir filtros por período, país y asesor.

Este Dashboard es analítico y debe mantenerse diferenciado del Dashboard operativo de Inicio.

## 7.8 Embudo comercial

Implementar un embudo visual de oportunidades.

Utilizar las etapas del pipeline comercial.

Permitir filtros por:

- Etapa.
- Cliente.
- Tipo de cliente.
- Asesor.
- Período, cuando aplique.

Mostrar cantidad de oportunidades por etapa y porcentajes cuando exista información suficiente para calcularlos correctamente.

### Relaciones del módulo

Reportes consume Clientes, Proyectos, Oportunidades, Forecast, Visitas y Actividades.

Administración determina los permisos y ámbitos de consulta.

Los reportes no deben modificar las entidades comerciales.

Las fórmulas e indicadores deben ser consistentes con Inicio.

---

# 8. MÓDULO 6 — INTEGRACIONES

## 8.1 Carga masiva de clientes

Implementar la capacidad de carga masiva de clientes mediante:

- CSV.
- XLSX.

Esta funcionalidad está contemplada como candidata a la versión 1.0 y requiere confirmación de viabilidad y aprobación para su habilitación productiva.

La implementación debe mantenerse separada del proceso inicial de carga de datos maestros.

### Funcionalidades

1. Descargar plantilla de clientes.
2. Seleccionar archivo.
3. Leer los registros.
4. Validar estructura.
5. Validar columnas.
6. Validar campos obligatorios.
7. Validar formatos.
8. Validar valores de catálogos.
9. Detectar duplicados dentro del archivo.
10. Detectar duplicados contra los clientes existentes.
11. Mostrar vista previa.
12. Mostrar errores por registro.
13. Confirmar importación.
14. Importar registros válidos.
15. Rechazar registros inválidos.
16. Descargar archivo de errores.
17. Consultar resultado e historial de cargas.

### Campos de importación

Utilizar los mismos campos de creación del Módulo de Clientes:

- Código de cliente.
- Razón social.
- Nombre comercial.
- País.
- Ciudad.
- Dirección.
- Teléfono.
- Correo.
- Tipo de empresa.
- Estado.
- Calificación.
- Responsable comercial.
- NIT.

El identificador CRM debe generarse automáticamente.

### Reglas

- Reutilizar las validaciones del Módulo de Clientes.
- No permitir duplicados.
- No sobrescribir clientes existentes sin una regla aprobada.
- Mostrar resultados por fila.
- Registrar usuario, fecha y estado de cada carga.
- Mantener integridad ante errores parciales.
- Restringir la ejecución a usuarios autorizados.

### Relaciones del módulo

Integraciones utiliza Clientes como destino de los registros.

Administración proporciona permisos, catálogos y parámetros de validación.

Los clientes importados deben poder utilizarse normalmente desde los demás módulos.

---

# 9. MÓDULO 7 — ADMINISTRACIÓN

**Este módulo debe implementarse al final.**

Las tablas de usuarios, permisos, catálogos y parámetros deben existir y utilizarse desde la preparación inicial de la base de datos.

En esta fase se implementarán sus pantallas de mantenimiento.

No duplicar ni reemplazar sus estructuras.

## 9.1 Usuarios

Implementar mantenimiento de usuarios.

Campos:

- Código de colaborador.
- Nombres.
- Apellidos.
- Correo.
- Teléfono.
- País.
- Activo.
- Rol.
- Equipo.

Funcionalidades:

- Crear.
- Consultar.
- Editar.
- Activar.
- Desactivar.
- Asignar rol.
- Asignar equipo.
- Asignar país.

### Reglas

- Código de colaborador único.
- Correo único.
- Validación de obligatorios.
- Desactivación lógica.
- Mantener referencias históricas.
- Aplicar permisos administrativos.
- Registrar auditoría.

## 9.2 Roles y permisos

Implementar mantenimiento de roles.

Roles iniciales:

- Asesor.
- Manager.
- Administrador.

Permisos funcionales:

- Crear.
- Editar.
- Consultar.
- Cerrar.
- Eliminar, cuando corresponda.
- Exportar.
- Administrar.

Permitir asignar permisos por módulo y operación.

Permitir controlar el ámbito de visibilidad:

- Registros propios.
- Equipo.
- País.
- Ámbito administrativo autorizado.

El control de permisos debe aplicarse en backend y frontend.

No limitar la seguridad a ocultar botones.

Los usuarios únicamente deben consultar o modificar información dentro de sus permisos.

## 9.3 Catálogos

Implementar un mantenimiento reutilizable para los campos tipo lista.

Debe permitir:

- Crear valores.
- Consultar.
- Editar.
- Activar.
- Desactivar.
- Ordenar valores.
- Consultar estado.

Aplicar el mantenimiento a los catálogos utilizados por:

- Clientes.
- Proyectos.
- Oportunidades.
- Productos.
- Forecast.
- Visitas.
- Actividades.

### Reglas

- No permitir duplicados dentro de un catálogo.
- No eliminar valores utilizados históricamente.
- Mantener identificadores estables.
- Permitir desactivar valores.
- Auditar modificaciones.
- Reflejar los cambios en los formularios comerciales.

**Este mantenimiento debe operar sobre los catálogos que fueron cargados al inicio mediante seeds.**

No crear estructuras paralelas ni nuevos arreglos fijos de valores.

## 9.4 Parámetros generales

Implementar mantenimiento de:

- Reglas de duplicidad.
- Campos obligatorios configurables.
- Valores predeterminados.
- Alertas.
- Vencimientos.
- Reglas de avance.
- Configuración funcional de login.
- Tipo de autenticación o ingreso permitido.
- Conversiones y estimaciones comerciales.

Los parámetros deben ser utilizados por los módulos correspondientes.

La configuración del login debe respetar el mecanismo de autenticación definido en el proyecto.

No crear un sistema paralelo de autenticación.

## 9.5 Auditoría e historial de cambios

Implementar consulta de auditoría.

Campos:

- Entidad.
- Identificador del registro.
- Acción.
- Campo modificado.
- Valor anterior.
- Valor nuevo.
- Usuario.
- Fecha y hora.

Registrar modificaciones relevantes de:

- Clientes.
- Contactos.
- Proyectos.
- Fases.
- Oportunidades.
- Resultados comerciales.
- Productos asociados.
- Forecast.
- Visitas.
- Actividades.
- Usuarios.
- Roles.
- Permisos.
- Catálogos.
- Parámetros.

Permitir consultar el historial mediante filtros.

Restringir modificación y eliminación de registros de auditoría.

### Relaciones del módulo

Administración suministra datos maestros, permisos y parámetros al resto del CRM.

Los módulos deben utilizar directamente las mismas referencias maestras existentes desde la Fase 0.

No se deben modificar las relaciones funcionales al desarrollar las pantallas administrativas.

---

# 10. Archivos de implementación que debes generar

Con base en todas las definiciones anteriores, crea los archivos de implementación funcional dentro de la estructura de documentación establecida por el proyecto.

Como mínimo deben existir siete especificaciones independientes, identificadas claramente:

1. `01-inicio-dashboard.md`
2. `02-clientes-cuentas.md`
3. `03-proyectos.md`
4. `04-actividad-comercial.md`
5. `05-reportes.md`
6. `06-integraciones.md`
7. `07-administracion.md`

Respeta las convenciones de nombres y directorios del repositorio si ya existe una estructura equivalente.

Cada archivo debe contener:

### A. Objetivo funcional
Explicar qué resuelve el módulo y cuáles son sus responsabilidades.

### B. Alcance completo
Describir todas las pantallas, secciones, operaciones y funcionalidades de este prompt, sin omisiones.

### C. Reglas de negocio
Documentar las validaciones, restricciones y comportamientos funcionales.

### D. Modelo de datos utilizado
Identificar: entidades propias, entidades compartidas, claves y relaciones, catálogos utilizados, restricciones de integridad. No duplicar modelos Prisma ni crear tablas innecesarias.

### E. Pantallas y componentes
Definir: listados, formularios, fichas, secciones, filtros, operaciones, navegación, estados de cada pantalla.

### F. Servicios y contratos
Definir las operaciones que necesita el módulo y sus contratos de entrada y salida. Distinguir operaciones propias de consultas realizadas a otros módulos. No desarrollar los módulos dependientes dentro del actual.

### G. Relaciones e integraciones internas
Documentar: qué información consume, qué información proporciona, identificadores utilizados, comportamiento cuando otro módulo aún no está implementado.

### H. Seguridad
Identificar las operaciones sujetas a permisos y las restricciones de visibilidad.

### I. Criterios de aceptación
Establecer criterios verificables para todas las funcionalidades.

### J. Pruebas funcionales
Definir casos de prueba positivos, negativos y de integración.

### K. Dependencias y orden
Identificar qué necesita el módulo para funcionar y cuáles son sus dependencias futuras.

### L. Archivos de código a implementar
Identificar los archivos backend, frontend, pruebas y configuraciones que deberán crearse o modificarse, usando la estructura real del proyecto y sin inventar convenciones alternativas.

---

# 11. Orden de implementación

El orden de documentación seguirá la numeración original de los siete módulos.

Sin embargo, el orden recomendado para implementar las funcionalidades es:

1. Preparación del modelo Prisma y carga de maestros.
2. Clientes / Cuentas.
3. Proyectos.
4. Actividad Comercial.
5. Inicio / Dashboard.
6. Reportes.
7. Integraciones.
8. Administración y Catálogos.

La preparación del modelo de datos es una fase transversal, no un octavo módulo funcional.

### Regla de independencia

Cada módulo debe poder implementarse individualmente utilizando el modelo de datos compartido.

No desarrollar funcionalidades pertenecientes a módulos posteriores como parte de uno anterior.

Se permite preparar contratos, referencias y componentes transversales necesarios para conservar la integridad de la solución.

No implementar las pantallas de mantenimiento administrativo antes de llegar al último módulo.

---

# 12. Matriz de cobertura funcional

Debes generar una matriz de trazabilidad que permita verificar que todas las funcionalidades han sido contempladas.

La matriz debe incluir las **47 funcionalidades identificadas en el documento de alcance**, agrupadas en los siete módulos.

Por cada funcionalidad registrar: módulo, pantalla o funcionalidad, descripción, archivo de implementación, entidades utilizadas, dependencias, criterios de aceptación, casos de prueba, estado de implementación.

No marcar funcionalidades como completadas únicamente por haber creado su documentación.

Una funcionalidad se considerará completada cuando su comportamiento esté implementado y validado.

Si detectas definiciones que todavía requieren una decisión de negocio, documenta explícitamente el punto pendiente.

No elimines funcionalidades por estar pendientes de definición; conserva su alcance y marca la decisión necesaria.

---

# 13. Instrucciones finales

Analiza el repositorio existente y utiliza las definiciones anteriores como **fuente del alcance funcional completo del CRM**.

No generes nuevamente la arquitectura base si ya está definida.

No reemplaces los estándares del proyecto.

No omitas funcionalidades ni relaciones entre módulos.

Primero verifica el modelo de datos y prepara los datos maestros iniciales.

Genera las siete especificaciones de implementación, cada una independiente, y una matriz de trazabilidad que garantice la cobertura completa.

Posteriormente, utiliza esos archivos como referencia para implementar los módulos **uno por uno**, siguiendo el orden establecido y verificando cada módulo antes de continuar.

Los mantenimientos administrativos deben permanecer para el final, pero todos los módulos deben utilizar desde el inicio sus tablas y catálogos reales.

**El resultado esperado es contar con la definición de implementación completa de los siete módulos, con todas sus pantallas, validaciones, reglas de negocio, relaciones, dependencias, criterios de aceptación y archivos necesarios, para desarrollar el CRM de manera incremental sin perder ninguna funcionalidad del alcance original.**
