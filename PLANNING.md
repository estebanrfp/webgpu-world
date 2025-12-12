Quiero que me generes **la estructura base de un proyecto WebGPU usando TypeGPU** en TypeScript para un mundo virtual completo con las siguientes características:

1. **Cielo procedural volumétrico**  
   - cielo dinámico con fases de día: amanecer, día, atardecer, noche.  
   - nubes volumétricas con densidad configurable por tiempo del día.  
   - iluminación procedimental basada en posición solar (no solo gradiente, sino color y exposición adaptativa).  

2. **Terreno procedural infinito**  
   - generar terreno 3D usando ruido fractal (FBM/Perlin) que se extienda indefinidamente mientras el jugador se desplaza.  
   - aplicar **triplanar mapping** para texturas evitando estiramiento.  
   - terreno con montañas, islas emergentes y llanuras que se hunden en el nivel del agua.  

3. **Océano realista y de alto rendimiento**  
   - agua con shader que simule calma general, pero con espuma cerca de la costa.  
   - efecto de horizonte oceánico y reflexiones ligeras.  
   - la capa de agua debe ser eficiente (no demasiadas partículas o físicas costosas).  

4. **Controlador de personaje en tercera persona**  
   - sistema WASD para **caminar, correr y saltar**.  
   - opción de **vuelo libre** (modo “fly”) con suavizado de movimiento.  
   - cámara tercera persona que siga al personaje con suavidad.  

5. **Físicas básicas e interacción con el terreno**  
   - detección de colisiones con suelo/terreno para evitar atravesar el nivel.  
   - gravedad y “raycast hacia abajo” para ajustar altura del personaje sobre el terreno.  
   - lógica de superficie para agua (que detecte si está sobre océano o terreno).  

6. **Clima dinámico**  
   - opción de **lluvia** y **nieve**, ambas procedurales y ligadas al entorno y tiempo.  
   - tormentas con efectos visuales / destellos en el cielo.  
   - transición suave entre climas.  

7. **Organización de proyecto y arquitectura del código**  
   - estructura de carpetas y módulos (render, shaders, físicas, clima, controlador de jugador, utilidades).  
   - pipeline básico de renderizado y actualización (bucle principal).  
   - división entre **render, cálculos de terreno, físicas, clima y lógica de entrada**.  

8. **Optimización y buen rendimiento**  
   - uso de **instancing** donde sea apropiado (por ejemplo para nubes o vegetación procedimental).  
   - distancia de renderizado adaptativa para terreno infinito.  
   - uso de **compute shaders para terreno y nubes** si es útil al rendimiento.  

9. **Punto de partida utilizable**  
   - dame:  
     - **estructura de proyecto** con carpetas y archivos principales  
     - **pseudocódigo o esqueleto de funciones** para cada sistema (cielo, terreno, océano, controlador, físicas, clima)  
     - **snippets de shader (WGSL/TypeGPU)** para cielo procedural, terreno, agua y nubes  
     - **base del character controller** (input, movimiento, detección de colisiones)  
     - **sugerencias de integración de físicas** (puede ser cálculo manual de colisiones con raycasts o integración con motor JS de físicas)

Genera todo lo más modular y documentado posible en TypeScript moderno (ES2020+) usando TypeGPU. Queremos poder expandir este mundo virtual más adelante. 

No incluyas código de motores 3D de alto nivel (como Three.js), quiero que el ejemplo use directamente **TypeGPU/WebGPU** con lógica personalizada.  