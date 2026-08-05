<template>
  <div class="modal-overlay" v-if="visible" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h2>添加账号</h2>
        <button class="close-btn" @click="handleClose">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">账号备注名</label>
          <input
            v-model="form.name"
            type="text"
            class="input"
            placeholder="例如：主号、小号1"
          />
        </div>

        <div class="tip-box">
          <div class="tip-icon">⏳</div>
          <div class="tip-content">
            <p class="tip-title">导入当前 TRAE 桌面账号</p>
            <p class="tip-desc">先在 TRAE 客户端切换到目标账号，再点击下方导入。凭证仅加密保存在本机。</p>
          </div>
        </div>

        <div class="form-group">
          <label class="form-checkbox">
            <input type="checkbox" v-model="form.enabled" checked />
            <span>启用自动签到</span>
          </label>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleClose">取消</button>
        <button class="btn btn-primary" @click="importDesktopAccount" :disabled="submitting">
          <span v-if="submitting" class="spinner"></span>
          <span>{{ submitting ? '导入中...' : '导入当前 TRAE 桌面账号' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAppStore } from '../stores/app'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['update:visible', 'success'])

const store = useAppStore()

const form = ref({
  name: '',
  enabled: true
})

const submitting = ref(false)

watch(() => props.visible, (val) => {
  if (val) {
    form.value = { name: '', enabled: true }
  }
})

function handleClose() {
  emit('update:visible', false)
}

async function importDesktopAccount() {
  submitting.value = true
  try {
    await store.importDesktopAccount()
    emit('success')
  } catch (e: any) {
    alert('导入失败: ' + (e.message || e))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  width: 520px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-muted);
  padding: 4px;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.label-tip {
  font-weight: normal;
  margin-left: 8px;
}

.link-btn {
  background: none;
  border: none;
  color: var(--primary-color);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}

.link-btn:hover {
  text-decoration: underline;
}

.textarea {
  resize: vertical;
  min-height: 100px;
  font-family: monospace;
  font-size: 12px;
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
  line-height: 1.5;
}

.form-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-primary);
}

.form-checkbox input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.tip-box {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: var(--primary-light);
  border-radius: var(--radius-sm);
  margin-bottom: 20px;
}

.tip-icon {
  font-size: 20px;
}

.tip-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--primary-color);
  margin-bottom: 4px;
}

.tip-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
}
</style>
