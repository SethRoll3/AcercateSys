import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified } from "@/lib/http-cache"

export async function GET(req: NextRequest) {
  try {
    const userClient = await createClient()
    const url = new URL(req.url)
    const emailsOnly = url.searchParams.get("emailsOnly") === "true"

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (emailsOnly) {
      // Validate role (admins and advisors can obtain email list)
      const { data: me, error: meError } = await userClient
        .from("users")
        .select("role")
        .eq("auth_id", user.id)
        .single()

      if (meError || !me) {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
      }

      if (!["admin", "asesor"].includes(me.role)) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 })
      }

      // Use admin client to bypass any RLS and return minimal data
      const admin = await createAdminClient()
      const { data: users, error: usersError } = await admin
        .from("users")
        .select("email")
        .order("email")

      if (usersError) {
        console.error("Error fetching users emails:", usersError)
        return NextResponse.json({ error: "Failed to fetch user emails" }, { status: 500 })
      }

      {
        const responseData = users ?? []
        const body = stableJsonStringify(responseData)
        const headers = buildCacheHeaders({
          body,
          lastModified: latestUpdatedAt(responseData) ?? new Date(),
          cacheControl: 'private, max-age=0, must-revalidate',
        })
        const etag = headers['ETag']
        const lastMod = headers['Last-Modified']
        if (isNotModified(req, { etag, lastModified: lastMod })) {
          return new NextResponse(null, { status: 304, headers })
        }
        return NextResponse.json(responseData, { headers })
      }
    }

    // Default: Fetch full users list with regular client
    const { data: users, error: usersError } = await userClient
      .from("users")
      .select("id, email, full_name, role, created_at")
      .order("created_at", { ascending: false })

    if (usersError) {
      console.error("Error fetching users:", usersError)
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
    }

    {
      const responseData = users || []
      const body = stableJsonStringify(responseData)
      const headers = buildCacheHeaders({
        body,
        lastModified: latestUpdatedAt(responseData) ?? new Date(),
        cacheControl: 'private, max-age=0, must-revalidate',
      })
      const etag = headers['ETag']
      const lastMod = headers['Last-Modified']
      if (isNotModified(req, { etag, lastModified: lastMod })) {
        return new NextResponse(null, { status: 304, headers })
      }
      return NextResponse.json(responseData, { headers })
    }
  } catch (error) {
    console.error("Error in users API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const regular = await createClient()
  const admin = await createAdminClient()
  const userData = await req.json()

  try {
    // Validar permisos del solicitante (admin o asesor)
    const { data: { user: caller }, error: authError0 } = await regular.auth.getUser()
    if (authError0 || !caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: me } = await regular.from('users').select('role').eq('auth_id', caller.id).single()
    if (!me || !['admin','asesor'].includes(me.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Si es asesor, solo puede crear usuarios de rol 'cliente' para clientes asignados a él
    if (me.role === 'asesor') {
      if (String(userData.role) !== 'cliente') {
        return NextResponse.json({ error: 'Forbidden: advisors can only create cliente users' }, { status: 403 })
      }
      const { data: assignedClient } = await admin
        .from('clients')
        .select('id')
        .eq('email', userData.email)
        .eq('advisor_id', caller.id)
        .limit(1)
      if (!Array.isArray(assignedClient) || !assignedClient[0]) {
        return NextResponse.json({ error: 'Forbidden: client not assigned to advisor' }, { status: 403 })
      }
    }

    // Crear usuario en auth.users con service role
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true,
      user_metadata: {
        full_name: userData.full_name,
        role: userData.role
      }
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    const authId = authUser?.user?.id
    if (!authId) {
      return NextResponse.json({ error: 'No se obtuvo el UID de Auth al crear el usuario' }, { status: 500 })
    }

    // Evitar duplicados si el trigger ya creó el registro
    const { data: existingRows, error: existingError } = await admin
      .from('users')
      .select('id')
      .eq('auth_id', authId)
      .limit(1)

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    let user: any

    if (!existingRows || existingRows.length === 0) {
      // Crear registro en la tabla users con mapeo correcto a auth_id
      const { error: userError } = await admin
        .from('users')
        .insert({
          // Mantener id igual al UID para compatibilidad si el esquema lo permite,
          // pero usar auth_id como fuente de verdad para autenticación
          id: authId,
          auth_id: authId,
          email: userData.email,
          full_name: userData.full_name,
          role: userData.role
        })

      if (userError) {
        // Revertir creación en Auth si falla la inserción en users
        await admin.auth.admin.deleteUser(authId)
        return NextResponse.json({ error: userError.message }, { status: 500 })
      }
    }

    // Obtener el registro completo para retornarlo al cliente
    const { data: fullUser, error: fetchUserError } = await admin
      .from('users')
      .select('id, email, full_name, role, auth_id, created_at')
      .eq('auth_id', authId)
      .single()

    if (fetchUserError) {
      return NextResponse.json({ error: fetchUserError.message }, { status: 500 })
    }

    user = fullUser

    return NextResponse.json(user)
  } catch (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const regular = await createClient()
  const admin = await createAdminClient()
  const userData = await req.json()
  const { id, password, ...rest } = userData

  try {
    // Validate caller permissions (admin or advisor)
    const {
      data: { user: caller },
      error: authError,
    } = await regular.auth.getUser()

    if (authError || !caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: me, error: meError } = await regular
      .from('users')
      .select('role')
      .eq('auth_id', caller.id)
      .single()

    if (meError || !me || !['admin', 'asesor'].includes(me.role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // Fetch current user row to detect email changes
    const { data: currentRow, error: currentError } = await admin
      .from('users')
      .select('id, auth_id, email, full_name, role')
      .eq('id', id)
      .single()

    if (currentError || !currentRow) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const previousEmail = currentRow.email

    // Actualizar en la tabla users (admin client)
    const { data: updated, error: userError } = await admin
      .from('users')
      .update(rest)
      .eq('id', id)
      .select('id, email, full_name, role, auth_id')

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }

    const newEmail = rest.email ?? previousEmail

    // Actualizar en Auth: contraseña y/o metadata
    if (password && password.trim() !== '') {
      const { error: authError } = await admin.auth.admin.updateUserById(currentRow.auth_id, {
        password: password,
        email: newEmail,
        user_metadata: {
          full_name: rest.full_name ?? currentRow.full_name,
          role: rest.role ?? currentRow.role,
        },
      })
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 500 })
      }
    } else {
      const { error: authError } = await admin.auth.admin.updateUserById(currentRow.auth_id, {
        email: newEmail,
        user_metadata: {
          full_name: rest.full_name ?? currentRow.full_name,
          role: rest.role ?? currentRow.role,
        },
      })
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 500 })
      }
    }

    // Si cambió el email, sincronizar clientes que usen el antiguo email
    if (previousEmail && newEmail && previousEmail !== newEmail) {
      const { error: clientSyncError } = await admin
        .from('clients')
        .update({ email: newEmail })
        .eq('email', previousEmail)

      if (clientSyncError) {
        // No abortar la operación principal, solo loguear
        console.error('Error sincronizando email en clients:', clientSyncError)
      }
    }

    return NextResponse.json(updated?.[0] ?? { id, email: newEmail, full_name: rest.full_name ?? currentRow.full_name, role: rest.role ?? currentRow.role })
  } catch (error) {
    console.error('Error en PUT /api/users:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient({ admin: true })
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID de usuario requerido' }, { status: 400 })
  }

  try {
    // Buscar auth_id antes de eliminar para borrar también en Auth
    const { data: userRow, error: fetchError } = await supabase
      .from('users')
      .select('auth_id')
      .eq('id', id)
      .single()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Eliminar de la tabla users primero
    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('id', id)

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }

    // Eliminar del sistema de autenticación
    const { error: authError } = await supabase.auth.admin.deleteUser(userRow?.auth_id ?? id)

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Usuario eliminado con éxito' })
  } catch (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
