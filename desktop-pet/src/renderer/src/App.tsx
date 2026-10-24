import { useEffect, useRef } from 'react'
import * as THREE from 'three'

function App(): React.JSX.Element {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 100)
    camera.position.set(0, 1.6, 3.4)
    camera.lookAt(0, 1.0, 0)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setClearColor(0x000000, 0) // 透明背景
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(2, 3, 4)
    scene.add(key)

    // 占位角色：头球 + 身体方块的「雪人」，纯占位，W2 换成 VRM
    const group = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a90e2, roughness: 0.7 })
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), mat)
    head.position.y = 1.55
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.42), mat)
    body.position.y = 0.75
    group.add(head, body)
    scene.add(group)

    // 简化碰撞体（hitProxy 的 W1 版：包住角色的盒子，不可见）
    const hitProxy = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 2.0, 0.65),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    hitProxy.position.y = 1.0
    scene.add(hitProxy)

    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let lastHit = false

    const updateHit = (clientX: number, clientY: number): void => {
      ndc.x = (clientX / mount.clientWidth) * 2 - 1
      ndc.y = -(clientY / mount.clientHeight) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObject(hitProxy, false).length > 0
      if (hit !== lastHit) {
        lastHit = hit
        // 命中 → 可交互（ignore=false）；未命中 → 穿透（ignore=true）
        window.api.setClickThrough(!hit)
      }
    }

    const onMove = (e: MouseEvent): void => updateHit(e.clientX, e.clientY)
    const onLeave = (): void => {
      if (lastHit) {
        lastHit = false
        window.api.setClickThrough(true)
      }
    }
    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)

    const onResize = (): void => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    let raf = 0
    const animate = (): void => {
      group.rotation.y += 0.004
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden' }} />
}

export default App
