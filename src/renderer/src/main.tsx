import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { TaskProvider } from './lib/taskbus'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root 节点缺失')

createRoot(container).render(
  <StrictMode>
    <TaskProvider>
      <App />
    </TaskProvider>
  </StrictMode>
)
