import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { stableJsonStringify, buildCacheHeaders, latestUpdatedAt, isNotModified } from '@/lib/http-cache'

export async function GET(request: Request) {
  const supabase = await createClient()
  const admin = await createAdminClient()

  // Step 1: Get current user and role
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_id', user.id)
    .single();

  if (userError || !userData) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Step 2: Fetch all user emails with an admin client (bypasses RLS)
  const { data: users, error: usersError } = await admin
    .from('users')
    .select('email')

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }

  const userEmails = new Set(users.map(u => u.email.toLowerCase()))

  const { searchParams } = new URL(request.url)
  const inGroupParam = searchParams.get('in_group')

  // Step 3: Fetch clients with filtering based on role
  let query = supabase
    .from('clients')
    .select(`
      *,
      advisor:users!advisor_id(id, email),
      group:grupos(nombre)
    `)
    .order('created_at', { ascending: false })

  // If user is an advisor, filter by their ID
  if (userData.role === 'asesor') {
    query = query.eq('advisor_id', userData.id);
  }

  if (inGroupParam === 'false') {
    query = query.eq('in_group', false)
  } else if (inGroupParam === 'true') {
    query = query.eq('in_group', true)
  }

  const { data: clients, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Step 3: Transform the data, flatten advisor info, and add has_user flag
  const transformedClients = clients?.map(client => ({
    ...client,
    advisor_email: client.advisor?.email || null,
    group_name: client.group?.nombre || null,
    has_user: client.email ? userEmails.has(client.email.toLowerCase()) : false
  }))

  const responseData = transformedClients || []
  const body = stableJsonStringify(responseData)
  const headers = buildCacheHeaders({
    body,
    lastModified: latestUpdatedAt(responseData) ?? new Date(),
    cacheControl: 'private, max-age=0, must-revalidate',
  })
  const etag = headers['ETag']
  const lastMod = headers['Last-Modified']
  if (isNotModified(request, { etag, lastModified: lastMod })) {
    return new NextResponse(null, { status: 304, headers })
  }
  return NextResponse.json(responseData, { headers })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the current user for authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user role from the users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    if (userError || !userData) {
      console.log('User data error:', userError)
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Check if user has permission to create clients
    if (!['admin', 'asesor'].includes(userData.role)) {
      console.log('Insufficient permissions. User role:', userData.role)
      return NextResponse.json({ error: 'No tienes permisos para crear clientes' }, { status: 403 })
    }

    const client = await req.json()
    
    // Log the received data for debugging
    console.log('Received client data:', client)

    // Validate required fields
    const requiredFields = ['first_name', 'last_name', 'email', 'address', 'phone']
    for (const field of requiredFields) {
      if (!client[field] || client[field].trim() === '') {
        return NextResponse.json({ error: `Campo requerido faltante: ${field}` }, { status: 400 })
      }
    }

    // Remove empty advisor_id to avoid inserting empty string
    if (client.advisor_id === '' || client.advisor_id === null) {
      delete client.advisor_id
    }

    // Clean the data before insertion
    const cleanedClient = {
      first_name: client.first_name.trim(),
      last_name: client.last_name.trim(),
      email: client.email.trim().toLowerCase(),
      address: client.address.trim(),
      phone: client.phone.trim(),
      phone_country_code: (client.phone_country_code || '').trim() || null,
      emergency_phone: client.emergency_phone ? client.emergency_phone.trim() : null,
      ...(client.advisor_id && { advisor_id: client.advisor_id })
    }

    console.log('Cleaned client data:', cleanedClient)

    // Usar cliente admin para evitar errores de RLS tras verificar permisos
    const admin = await createAdminClient()
    const { data, error } = await admin.from('clients').insert(cleanedClient).select()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('Client created successfully:', data)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Unexpected error in POST /api/clients:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = await createClient({ admin: true })
    const client = await req.json()
    const { id, ...rest } = client

    // Get the current client data to check for email changes
    const { data: currentClient, error: fetchError } = await supabase
      .from('clients')
      .select('email')
      .eq('id', id)
      .single()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Update the client
    const { data, error } = await supabase
      .from('clients')
      .update(rest)
      .eq('id', id)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If email changed, update the associated user account
    if (rest.email && currentClient.email !== rest.email) {
      console.log(`Email changed from ${currentClient.email} to ${rest.email}`)
      
      // Check if there's a user with the old email
      const { data: existingUser, error: userFetchError } = await adminSupabase
        .from('users')
        .select('id, auth_id')
        .eq('email', currentClient.email)
        .single()

      if (!userFetchError && existingUser) {
        console.log('Updating user email from', currentClient.email, 'to', rest.email)
        
        // Update the user's email in the users table
        const { error: userUpdateError } = await adminSupabase
          .from('users')
          .update({ email: rest.email })
          .eq('id', existingUser.id)

        if (userUpdateError) {
          console.error('Error updating user email:', userUpdateError)
          // Don't fail the client update if user update fails
        }

        // Update the auth user's email using admin client
        try {
          const { error: authUpdateError } = await adminSupabase.auth.admin.updateUserById(
            existingUser.auth_id,
            { email: rest.email }
          )

          if (authUpdateError) {
            console.error('Error updating auth user email:', authUpdateError)
            // Don't fail the client update if auth update fails
          }
        } catch (authError) {
          console.error('Error with admin auth update:', authError)
        }
      }
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in client update:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'ID de cliente requerido' }, { status: 400 })
    }

    // Obtener usuario actual
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Obtener rol e id interno
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, role')
      .eq('auth_id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Validar permisos: admin puede eliminar cualquiera; asesor solo los asignados
    if (userData.role === 'asesor') {
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, advisor_id')
        .eq('id', id)
        .single()

      if (clientError || !client) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
      }

      if (client.advisor_id !== userData.id) {
        return NextResponse.json({ error: 'No autorizado para eliminar este cliente' }, { status: 403 })
      }
    } else if (userData.role === 'cliente') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // Usar cliente admin para ejecutar la eliminación una vez validado el permiso
    const admin = await createAdminClient()
    const { error } = await admin.from('clients').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Cliente eliminado con éxito' })
  } catch (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
