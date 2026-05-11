'use client'
import { useEffect } from 'react'

export default function PerfilPage() {
  useEffect(() => {
    window.location.replace('/dashboard/settings#perfil')
  }, [])
  return null
}
