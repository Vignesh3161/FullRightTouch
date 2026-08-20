import { useCallback, useState } from 'react'

export default function useCurrentLocation() {
  const [coords, setCoords] = useState({ latitude: '', longitude: '' })
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')

  const getLocation = useCallback(
    (onSuccess) =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          const msg = 'Geolocation is not supported by this browser'
          setLocationError(msg)
          reject(new Error(msg))
          return
        }
        setLocating(true)
        setLocationError('')
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const latitude = pos.coords.latitude.toFixed(6)
            const longitude = pos.coords.longitude.toFixed(6)
            setCoords({ latitude, longitude })
            setLocating(false)
            if (onSuccess) onSuccess({ latitude, longitude })
            resolve({ latitude, longitude })
          },
          (err) => {
            const msg = err?.message || 'Could not get browser location'
            setLocating(false)
            setLocationError(msg)
            reject(new Error(msg))
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )
      }),
    []
  )

  return { coords, setCoords, locating, locationError, setLocationError, getLocation }
}
