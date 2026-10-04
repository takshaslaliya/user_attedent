import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { 
  AlertTriangle, 
  Trash2, 
  AlertCircle, 
  HelpCircle, 
  ShieldAlert, 
  CheckCircle2, 
  X,
  Sparkles,
  Info
} from 'lucide-react';
import './ConfirmationModal.css';

export type ConfirmType = 'danger' | 'warning' | 'info' | 'primary' | 'success';

export interface CustomDialogOptions {
  mode?: 'confirm' | 'alert' | 'prompt';
  title?: string;
  message: string | ReactNode;
  warningNote?: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmType;
  icon?: 'trash' | 'warning' | 'shield' | 'info' | 'help' | 'check' | 'sparkles';
  defaultValue?: string;
  placeholder?: string;
}

interface CustomDialogContextType {
  confirm: (options: CustomDialogOptions | string) => Promise<boolean>;
  alert: (options: CustomDialogOptions | string) => Promise<void>;
  prompt: (options: CustomDialogOptions | string) => Promise<string | null>;
}

const DialogContext = createContext<CustomDialogContextType | undefined>(undefined);

export const ConfirmProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<CustomDialogOptions>({
    mode: 'confirm',
    message: '',
    title: 'Notification',
    type: 'info',
    confirmText: 'OK',
    cancelText: 'Cancel'
  });
  const [inputValue, setInputValue] = useState('');
  const [resolver, setResolver] = useState<((value: any) => void) | null>(null);

  const openDialog = useCallback((opts: CustomDialogOptions): Promise<any> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setInputValue(opts.defaultValue || '');
      setResolver(() => resolve);
      setIsOpen(true);
    });
  }, []);

  const confirm = useCallback((opts: CustomDialogOptions | string): Promise<boolean> => {
    let resolved: CustomDialogOptions;
    if (typeof opts === 'string') {
      const isDelete = opts.toLowerCase().includes('delete') || opts.toLowerCase().includes('remove') || opts.toLowerCase().includes('clear');
      resolved = {
        mode: 'confirm',
        title: isDelete ? 'Permanent Action' : 'Confirm Action',
        message: opts,
        type: isDelete ? 'danger' : 'warning',
        warningNote: isDelete ? 'This action is irreversible and cannot be undone.' : undefined,
        confirmText: isDelete ? 'Yes, Delete' : 'Yes, Proceed',
        cancelText: 'Cancel',
        icon: isDelete ? 'trash' : 'warning'
      };
    } else {
      resolved = {
        mode: 'confirm',
        title: opts.title || (opts.type === 'danger' ? 'Permanent Action' : 'Confirm Action'),
        message: opts.message,
        warningNote: opts.warningNote ?? (opts.type === 'danger' ? 'This action is irreversible and cannot be undone.' : undefined),
        confirmText: opts.confirmText || (opts.type === 'danger' ? 'Yes, Delete' : 'Yes, Proceed'),
        cancelText: opts.cancelText || 'Cancel',
        type: opts.type || 'warning',
        icon: opts.icon
      };
    }
    return openDialog(resolved);
  }, [openDialog]);

  const customAlert = useCallback((opts: CustomDialogOptions | string): Promise<void> => {
    let resolved: CustomDialogOptions;
    if (typeof opts === 'string') {
      const isSuccess = opts.toLowerCase().includes('success') || opts.includes('✅') || opts.toLowerCase().includes('synced');
      const isError = opts.toLowerCase().includes('fail') || opts.toLowerCase().includes('error') || opts.toLowerCase().includes('invalid');
      resolved = {
        mode: 'alert',
        title: isSuccess ? 'Success' : isError ? 'Notice' : 'Notification',
        message: opts,
        type: isSuccess ? 'success' : isError ? 'danger' : 'info',
        confirmText: 'OK',
        icon: isSuccess ? 'check' : isError ? 'warning' : 'info'
      };
    } else {
      resolved = {
        mode: 'alert',
        title: opts.title || (opts.type === 'success' ? 'Success' : 'Notification'),
        message: opts.message,
        warningNote: opts.warningNote,
        confirmText: opts.confirmText || 'OK',
        type: opts.type || 'info',
        icon: opts.icon || (opts.type === 'success' ? 'check' : 'info')
      };
    }
    return openDialog(resolved);
  }, [openDialog]);

  const customPrompt = useCallback((opts: CustomDialogOptions | string): Promise<string | null> => {
    let resolved: CustomDialogOptions;
    if (typeof opts === 'string') {
      resolved = {
        mode: 'prompt',
        title: 'Input Required',
        message: opts,
        type: 'primary',
        confirmText: 'Submit',
        cancelText: 'Cancel'
      };
    } else {
      resolved = {
        mode: 'prompt',
        title: opts.title || 'Input Required',
        message: opts.message,
        warningNote: opts.warningNote,
        confirmText: opts.confirmText || 'Submit',
        cancelText: opts.cancelText || 'Cancel',
        type: opts.type || 'primary',
        defaultValue: opts.defaultValue,
        placeholder: opts.placeholder
      };
    }
    return openDialog(resolved);
  }, [openDialog]);

  // Global override for window.alert, window.confirm, window.prompt
  useEffect(() => {
    (window as any).alert = (msg: any) => {
      customAlert(String(msg));
    };

    (window as any).confirm = (msg: any) => {
      confirm(String(msg));
      return true;
    };

    (window as any).prompt = (msg: any, defaultVal?: string) => {
      customPrompt({ message: String(msg), defaultValue: defaultVal });
      return defaultVal || '';
    };
  }, [openDialog, customAlert, confirm, customPrompt]);

  const handleConfirm = () => {
    if (resolver) {
      if (options.mode === 'prompt') {
        resolver(inputValue);
      } else {
        resolver(true);
      }
    }
    setIsOpen(false);
  };

  const handleCancel = () => {
    if (resolver) {
      if (options.mode === 'prompt') {
        resolver(null);
      } else {
        resolver(false);
      }
    }
    setIsOpen(false);
  };

  const renderIcon = () => {
    const type = options.type || 'info';
    const customIcon = options.icon;

    if (customIcon === 'trash' || type === 'danger') {
      return (
        <div className="confirm-modal-icon-badge danger">
          <Trash2 size={26} />
        </div>
      );
    }
    if (customIcon === 'shield') {
      return (
        <div className="confirm-modal-icon-badge shield">
          <ShieldAlert size={26} />
        </div>
      );
    }
    if (customIcon === 'check' || type === 'success') {
      return (
        <div className="confirm-modal-icon-badge success">
          <CheckCircle2 size={26} />
        </div>
      );
    }
    if (customIcon === 'sparkles' || type === 'primary') {
      return (
        <div className="confirm-modal-icon-badge primary">
          <Sparkles size={26} />
        </div>
      );
    }
    if (type === 'warning') {
      return (
        <div className="confirm-modal-icon-badge warning">
          <AlertTriangle size={26} />
        </div>
      );
    }
    return (
      <div className="confirm-modal-icon-badge info">
        <Info size={26} />
      </div>
    );
  };

  return (
    <DialogContext.Provider value={{ confirm, alert: customAlert, prompt: customPrompt }}>
      {children}
      {isOpen && (
        <div className="confirm-modal-overlay" onClick={handleCancel}>
          <div 
            className={`confirm-modal-box ${options.type || 'info'}`} 
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              className="confirm-modal-close" 
              onClick={handleCancel}
              title="Close"
            >
              <X size={18} />
            </button>

            <div className="confirm-modal-header">
              {renderIcon()}
              <div className="confirm-modal-title-area">
                <h3 className="confirm-modal-title">{options.title}</h3>
                <span className="confirm-modal-badge">
                  {options.mode === 'confirm' 
                    ? (options.type === 'danger' ? 'Irreversible Action' : 'Action Required') 
                    : (options.type === 'success' ? 'Success Notification' : 'System Notification')}
                </span>
              </div>
            </div>

            <div className="confirm-modal-body">
              <div className="confirm-modal-message">
                {options.message}
              </div>

              {options.mode === 'prompt' && (
                <div style={{ marginTop: '1rem' }}>
                  <input
                    type="text"
                    style={{ width: '100%' }}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={options.placeholder || 'Enter value...'}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirm();
                      if (e.key === 'Escape') handleCancel();
                    }}
                  />
                </div>
              )}

              {options.warningNote && (
                <div className="confirm-modal-warning-box">
                  <AlertCircle size={16} className="warning-icon" />
                  <span>{options.warningNote}</span>
                </div>
              )}
            </div>

            <div className="confirm-modal-footer">
              {options.mode !== 'alert' && (
                <button 
                  type="button" 
                  className="confirm-btn-cancel" 
                  onClick={handleCancel}
                >
                  {options.cancelText || 'Cancel'}
                </button>
              )}
              <button 
                type="button" 
                className={`confirm-btn-action ${options.type || 'primary'}`} 
                onClick={handleConfirm}
                autoFocus
              >
                {options.confirmText || (options.mode === 'alert' ? 'OK' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
};

export const useCustomDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useCustomDialog must be used within a ConfirmProvider');
  }
  return context;
};
