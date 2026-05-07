'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/Modal';
import { LoginForm, getLoginFormTitleKey, type LoginFormMode } from './LoginForm';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: LoginFormMode;
}

export function LoginModal({ isOpen, onClose, initialMode = 'signin' }: LoginModalProps) {
  const t = useTranslations('studio');
  const [mode] = useState<LoginFormMode>(initialMode);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t(getLoginFormTitleKey(mode))}>
      <div className="p-1">
        <LoginForm initialMode={initialMode} onSuccess={onClose} />
      </div>
    </Modal>
  );
}
