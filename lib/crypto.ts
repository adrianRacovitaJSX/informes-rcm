// Utilidades para hash de contraseñas usando Web Crypto API

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  
  // Generar salt aleatorio
  const salt = crypto.getRandomValues(new Uint8Array(16))
  
  // Importar la contraseña como clave
  const key = await crypto.subtle.importKey(
    'raw',
    data,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  
  // Derivar la clave con PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    key,
    256
  )
  
  // Combinar salt y hash
  const hashArray = new Uint8Array(derivedBits)
  const combined = new Uint8Array(salt.length + hashArray.length)
  combined.set(salt)
  combined.set(hashArray, salt.length)
  
  // Convertir a base64
  return btoa(String.fromCharCode(...combined))
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    // Decodificar el hash almacenado
    const combined = new Uint8Array(
      atob(hashedPassword).split('').map(char => char.charCodeAt(0))
    )
    
    // Extraer salt y hash
    const salt = combined.slice(0, 16)
    const storedHash = combined.slice(16)
    
    // Hash de la contraseña proporcionada con el mismo salt
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    
    const key = await crypto.subtle.importKey(
      'raw',
      data,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    )
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      key,
      256
    )
    
    const newHash = new Uint8Array(derivedBits)
    
    // Comparar los hashes
    if (newHash.length !== storedHash.length) {
      return false
    }
    
    for (let i = 0; i < newHash.length; i++) {
      if (newHash[i] !== storedHash[i]) {
        return false
      }
    }
    
    return true
  } catch (error) {
    console.error('Error verifying password:', error)
    return false
  }
}
