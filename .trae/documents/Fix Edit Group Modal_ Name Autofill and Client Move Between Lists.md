## Problemas Identificados

* El nombre no se autollenaba porque el modal usa `group.name`, pero el tipo real trae `group.nombre` (lib/types.ts:139–144). En `components/manage-group-modal.tsx:36` se setea `groupName` con `group.name` dejando vacío.

* Al quitar un cliente de "Seleccionados" no vuelve a "Disponibles" porque sólo se filtra `selectedClients` y no se inserta el cliente removido en `availableClients`. Además, al agregar no se elimina de `availableClients`, quedando inconsistente.

## Cambios Propuestos (mínimos, sin romper)

1. Nombre del grupo:

   * En `useEffect` del modal (components/manage-group-modal.tsx:33–41) setear `groupName` así: `setGroupName(group.nombre ?? group.name ?? '')`.
2. Mover clientes entre listas:

   * Crear helpers:

     * `addClient(client)` → añade a `selectedClients` y lo quita de `availableClients`.

     * `removeClient(client)` → lo quita de `selectedClients` y lo añade a `availableClients` si no existe ya.

   * Usar `addClient` en el botón “Agregar” (línea 139) y `removeClient` en “Quitar” (línea 114).

   * Mantener `filteredAvailableClients` excluyendo los `selectedIds` para evitar duplicados.

## Verificación

* Al abrir “Editar Grupo”, el nombre aparece correctamente.

* Al quitar un cliente de seleccionados, se mueve a disponibles de inmediato.

* Al agregar desde disponibles, desaparece de disponibles y aparece en seleccionados.

¿Confirmas que aplique estos ajustes ahora?, si solo que obviamente si se quita un cliente y se vuelve a poner pues ahi revisa que no salte error porque ya esta engrupo, ya que al editar noi se modifica al instante si esta en grupo o no hasta que se da en guardar entonces por cualquier cosa, y porfavor verifica que salte alerta cuando el nombre este vacio y se intente guardar, al igual que cuando hayan menos de 3 clientes o mas de 5, y obvio que no deje guardar
