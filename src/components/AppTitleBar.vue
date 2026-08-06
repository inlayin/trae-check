<template>
  <header class="app-titlebar" @dblclick="toggleMaximize">
    <div class="titlebar-brand">
      <img class="titlebar-icon" :src="appIcon" alt="" />
      <div>
        <div class="titlebar-name">TraeCheck</div>
        <div class="titlebar-hint">每日自动签到工具</div>
      </div>
    </div>
    <div class="titlebar-drag-space" aria-hidden="true"></div>
    <div class="titlebar-controls">
      <button class="titlebar-control" type="button" aria-label="最小化" @click="minimize">
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8" /></svg>
      </button>
      <button class="titlebar-control" type="button" :aria-label="isMaximized ? '还原' : '最大化'" @click="toggleMaximize">
        <svg v-if="isMaximized" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1h6v6M1 3h6v6H1z" /></svg>
        <svg v-else viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5h7v7h-7z" /></svg>
      </button>
      <button class="titlebar-control titlebar-close" type="button" aria-label="关闭" @click="close">
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="m1.5 1.5 7 7m0-7-7 7" /></svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import appIcon from '../../assets/icon.png'

const isMaximized = ref(false)
let unsubscribe: (() => void) | undefined

function minimize() {
  void window.electronAPI.windowControls.minimize()
}

function toggleMaximize() {
  void window.electronAPI.windowControls.toggleMaximize()
}

function close() {
  void window.electronAPI.windowControls.close()
}

onMounted(async () => {
  isMaximized.value = await window.electronAPI.windowControls.isMaximized()
  unsubscribe = window.electronAPI.windowControls.onMaximizedChanged((value) => {
    isMaximized.value = value
  })
})

onUnmounted(() => unsubscribe?.())
</script>

<style scoped>
.app-titlebar {
  height: 48px;
  min-height: 48px;
  display: flex;
  align-items: stretch;
  color: white;
  background: linear-gradient(90deg, #1e1b4b 0%, #312e81 100%);
  -webkit-app-region: drag;
  user-select: none;
}

.titlebar-brand { display: flex; align-items: center; gap: 10px; padding: 0 16px; }
.titlebar-icon { width: 28px; height: 28px; border-radius: 7px; }
.titlebar-name { font-size: 14px; font-weight: 600; line-height: 18px; }
.titlebar-hint { font-size: 11px; color: rgba(255, 255, 255, .65); line-height: 15px; }
.titlebar-drag-space { flex: 1; }
.titlebar-controls { display: flex; -webkit-app-region: no-drag; }
.titlebar-control { width: 46px; border: 0; color: rgba(255, 255, 255, .9); background: transparent; cursor: pointer; display: grid; place-items: center; }
.titlebar-control:hover { background: rgba(255, 255, 255, .12); }
.titlebar-close:hover { background: #dc2626; }
.titlebar-control:focus-visible { outline: 2px solid white; outline-offset: -3px; }
.titlebar-control svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.2; }
</style>
