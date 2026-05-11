'use client'
import { useEffect } from 'react'

export default function PreferenciasPage() {
  useEffect(() => {
    window.location.replace('/dashboard/settings#aparencia')
  }, [])
  return null
}
