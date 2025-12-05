"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Settings, 
  X, 
  Check, 
  AlertCircle, 
  Loader2,
  Cloud,
  Server,
  Key,
  Database,
  Shield,
  Download,
  Upload
} from "lucide-react";
import { 
  StorageConfig, 
  getStorageConfig, 
  saveStorageConfig, 
  clearStorageConfig,
  isStorageConfigured 
} from "@/lib/settings";
import { testStorageConnection } from "@/lib/storage-client";

interface StorageSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
}

export function StorageSettings({ isOpen, onClose, onConfigSaved }: StorageSettingsProps) {
  const [config, setConfig] = useState<StorageConfig>({
    provider: 'r2',
    endpoint: '',
    region: 'auto',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    accountId: '',
  });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const savedConfig = getStorageConfig();
      if (savedConfig) {
        setConfig(savedConfig);
      }
      setTestResult(null);
    }
  }, [isOpen]);

  const handleProviderChange = (provider: 's3' | 'r2' | 'custom') => {
    let newConfig = { ...config, provider };
    
    if (provider === 'r2' && config.accountId) {
      newConfig.endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
      newConfig.region = 'auto';
    } else if (provider === 's3') {
      newConfig.region = 'us-east-1';
      newConfig.endpoint = '';
    }
    
    setConfig(newConfig);
  };

  const handleAccountIdChange = (accountId: string) => {
    let newConfig = { ...config, accountId };
    if (config.provider === 'r2' && accountId) {
      newConfig.endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    }
    setConfig(newConfig);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const result = await testStorageConnection(config);
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Connection test failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      saveStorageConfig(config);
      onConfigSaved();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    clearStorageConfig();
    setConfig({
      provider: 'r2',
      endpoint: '',
      region: 'auto',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      accountId: '',
    });
    setTestResult(null);
    onConfigSaved();
  };

  const handleExport = () => {
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      config: config,
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloud-storage-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setTestResult({ success: true, message: 'Config exported successfully' });
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        if (!data.config) {
          setTestResult({ success: false, message: 'Invalid config file format' });
          return;
        }

        const importedConfig = data.config as StorageConfig;
        
        // Validate required fields exist
        if (!importedConfig.endpoint || !importedConfig.bucket) {
          setTestResult({ success: false, message: 'Config missing required fields' });
          return;
        }

        setConfig(importedConfig);
        setTestResult({ success: true, message: 'Config imported - click Save to apply' });
      } catch (err) {
        setTestResult({ success: false, message: 'Failed to parse config file' });
      }
    };
    reader.readAsText(file);
    
    // Reset input so same file can be imported again
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#161616] border border-[#252525] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#252525]">
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-blue-400" />
            <h2 className="text-xl font-bold text-white">Storage Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#252525] rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Provider Selection */}
          <div className="space-y-3">
            <Label className="text-white">Storage Provider</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['r2', 's3', 'custom'] as const).map((provider) => (
                <button
                  key={provider}
                  onClick={() => handleProviderChange(provider)}
                  className={`p-3 rounded-lg border transition-colors ${
                    config.provider === provider
                      ? 'border-blue-500 bg-blue-950/30 text-blue-300'
                      : 'border-[#252525] bg-[#0f0f0f] text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Cloud className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      {provider === 'r2' ? 'Cloudflare R2' : provider === 's3' ? 'Amazon S3' : 'Custom'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* R2 Account ID */}
          {config.provider === 'r2' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-slate-400" />
                <Label htmlFor="accountId" className="text-white">
                  Cloudflare Account ID
                </Label>
              </div>
              <Input
                id="accountId"
                type="text"
                value={config.accountId || ''}
                onChange={(e) => handleAccountIdChange(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="bg-[#0f0f0f] border-[#252525] text-white placeholder:text-slate-600 focus:border-slate-600"
              />
              <p className="text-xs text-slate-500">
                Find in Cloudflare Dashboard → R2 → Overview
              </p>
            </div>
          )}

          {/* Endpoint */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-slate-400" />
              <Label htmlFor="endpoint" className="text-white">
                Endpoint URL
              </Label>
            </div>
            <Input
              id="endpoint"
              type="url"
              value={config.endpoint}
              onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
              placeholder={config.provider === 's3' ? 'https://s3.amazonaws.com' : 'https://xxx.r2.cloudflarestorage.com'}
              className="bg-[#0f0f0f] border-[#252525] text-white placeholder:text-slate-600 focus:border-slate-600"
            />
          </div>

          {/* Region */}
          {config.provider !== 'r2' && (
            <div className="space-y-3">
              <Label htmlFor="region" className="text-white">Region</Label>
              <Input
                id="region"
                type="text"
                value={config.region}
                onChange={(e) => setConfig({ ...config, region: e.target.value })}
                placeholder="us-east-1"
                className="bg-[#0f0f0f] border-[#252525] text-white placeholder:text-slate-600 focus:border-slate-600"
              />
            </div>
          )}

          {/* Bucket */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-400" />
              <Label htmlFor="bucket" className="text-white">Bucket Name</Label>
            </div>
            <Input
              id="bucket"
              type="text"
              value={config.bucket}
              onChange={(e) => setConfig({ ...config, bucket: e.target.value })}
              placeholder="my-encrypted-files"
              className="bg-[#0f0f0f] border-[#252525] text-white placeholder:text-slate-600 focus:border-slate-600"
            />
          </div>

          {/* Access Key ID */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-slate-400" />
              <Label htmlFor="accessKeyId" className="text-white">Access Key ID</Label>
            </div>
            <Input
              id="accessKeyId"
              type="text"
              value={config.accessKeyId}
              onChange={(e) => setConfig({ ...config, accessKeyId: e.target.value })}
              placeholder="AKIAXXXXXXXXXXXXXXXX"
              className="bg-[#0f0f0f] border-[#252525] text-white placeholder:text-slate-600 focus:border-slate-600 font-mono text-sm"
            />
          </div>

          {/* Secret Access Key */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400" />
              <Label htmlFor="secretAccessKey" className="text-white">Secret Access Key</Label>
            </div>
            <Input
              id="secretAccessKey"
              type="password"
              value={config.secretAccessKey}
              onChange={(e) => setConfig({ ...config, secretAccessKey: e.target.value })}
              placeholder="••••••••••••••••••••••••••••••••••••••••"
              className="bg-[#0f0f0f] border-[#252525] text-white placeholder:text-slate-600 focus:border-slate-600 font-mono text-sm"
            />
          </div>

          {/* Security Notice */}
          <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-900/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-300 text-sm font-medium">Credentials stored locally</p>
                <p className="text-amber-400/70 text-xs mt-1">
                  Your storage credentials are saved only in your browser&apos;s local storage. 
                  They are never sent to any UNET servers.
                </p>
              </div>
            </div>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`p-4 rounded-lg border ${
              testResult.success 
                ? 'bg-green-950/20 border-green-900/30' 
                : 'bg-red-950/20 border-red-900/30'
            }`}>
              <div className="flex items-center gap-3">
                {testResult.success ? (
                  <Check className="h-5 w-5 text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-400" />
                )}
                <span className={`text-sm ${testResult.success ? 'text-green-300' : 'text-red-300'}`}>
                  {testResult.message}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Hidden import input */}
        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          onChange={handleImportFile}
          className="hidden"
        />

        {/* Footer */}
        <div className="flex flex-col gap-4 p-6 border-t border-[#252525]">
          {/* Import/Export row */}
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              onClick={handleImportClick}
              className="border-[#252525] bg-[#0f0f0f] text-slate-300 hover:bg-[#252525] flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import Config
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!config.endpoint || !config.bucket}
              className="border-[#252525] bg-[#0f0f0f] text-slate-300 hover:bg-[#252525] flex-1"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Config
            </Button>
          </div>

          {/* Main actions row */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleClear}
              className="border-red-900/50 text-red-400 hover:bg-red-950/30"
            >
              Clear Config
            </Button>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={isTesting || !config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey}
                className="border-[#252525] bg-[#0f0f0f] text-slate-300 hover:bg-[#252525]"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>
              
              <Button
                onClick={handleSave}
                disabled={isSaving || !config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
