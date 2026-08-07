<template>
  <Transition name="dialog-fade">
    <div v-if="visible" class="confirm-overlay" @click.self="handleCancel">
      <Transition name="dialog-pop" appear>
        <div v-if="visible" class="confirm-dialog" :class="type">
          <!-- 顶部强调条 -->
          <div class="dialog-accent"></div>

          <div class="dialog-content">
            <!-- 图标 -->
            <div class="confirm-icon" :class="type">
              <svg v-if="type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <svg v-else-if="type === 'danger'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <svg v-else-if="type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M15 9l-6 6M9 9l6 6" stroke-linecap="round"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01" stroke-linecap="round"/>
              </svg>
            </div>

            <!-- 标题 -->
            <h3 class="confirm-title">{{ title }}</h3>

            <!-- 内容 -->
            <p class="confirm-message" v-if="message">{{ message }}</p>
          </div>

          <!-- 按钮区 -->
          <div class="confirm-actions">
            <button
              v-if="showCancel"
              class="btn btn-secondary"
              @click="handleCancel"
            >
              {{ cancelText }}
            </button>
            <button
              class="btn"
              :class="confirmBtnClass"
              @click="handleConfirm"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export type ConfirmType = 'info' | 'warning' | 'danger' | 'error'

const props = withDefaults(defineProps<{
  visible: boolean
  title: string
  message?: string
  type?: ConfirmType
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
}>(), {
  type: 'info',
  confirmText: '确定',
  cancelText: '取消',
  showCancel: true
})

const emit = defineEmits(['confirm', 'cancel', 'update:visible'])

const confirmBtnClass = computed(() => {
  switch (props.type) {
    case 'danger': return 'btn-danger'
    case 'warning': return 'btn-primary'
    case 'error': return 'btn-danger'
    default: return 'btn-primary'
  }
})

function handleConfirm() {
  emit('confirm')
  emit('update:visible', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:visible', false)
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  backdrop-filter: blur(3px);
}

.confirm-dialog {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  width: 380px;
  max-width: 90vw;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.04);
  display: flex;
  flex-direction: column;
}

/* 顶部强调条 */
.dialog-accent {
  height: 4px;
  flex-shrink: 0;
}

.confirm-dialog.info .dialog-accent {
  background: linear-gradient(90deg, var(--primary-color), #8b5cf6);
}

.confirm-dialog.warning .dialog-accent {
  background: linear-gradient(90deg, var(--warning-color), #fbbf24);
}

.confirm-dialog.danger .dialog-accent,
.confirm-dialog.error .dialog-accent {
  background: linear-gradient(90deg, var(--danger-color), #f87171);
}

/* 内容区 */
.dialog-content {
  padding: 24px 28px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

/* 图标 */
.confirm-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}

.confirm-icon svg {
  width: 26px;
  height: 26px;
}

.confirm-icon.danger {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger-color);
}

.confirm-icon.warning {
  background: rgba(245, 158, 11, 0.12);
  color: var(--warning-color);
}

.confirm-icon.error {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger-color);
}

.confirm-icon.info {
  background: var(--primary-light);
  color: var(--primary-color);
}

/* 标题 */
.confirm-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  line-height: 1.4;
}

/* 内容 */
.confirm-message {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 300px;
}

/* 按钮区 */
.confirm-actions {
  display: flex;
  gap: 10px;
  padding: 0 28px 24px;
}

.confirm-actions .btn {
  flex: 1;
  padding: 9px 20px;
  font-size: 13px;
  font-weight: 500;
}

/* 动画 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-pop-enter-active {
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.28s ease;
}

.dialog-pop-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.dialog-pop-enter-from {
  transform: scale(0.92) translateY(-8px);
  opacity: 0;
}

.dialog-pop-leave-to {
  transform: scale(0.96);
  opacity: 0;
}
</style>
