'use client';

import React, { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { SignatureValidationResult } from '@/types/digital-signature';

export function ValidateSignatureTool({ className = '' }: { className?: string }) {
  const t = useTranslations('common');
  const tTool = useTranslations('tools.validateSign');

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [results, setResults] = useState<SignatureValidationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState(false);

  // Optional trusted cert
  const [_trustedCertFile, setTrustedCertFile] = useState<File | null>(null);
  const [trustedCertName, setTrustedCertName] = useState<string | null>(null);

  const handlePdfSelected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    setPdfFile(file);
    setError(null);
    setResults([]);
    setValidated(false);

    // Auto-validate
    setLoading(true);
    try {
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      const { validatePdfSignatures } = await import('@/lib/pdf/processors/validate-signature');
      const res = await validatePdfSignatures(pdfBytes);
      setResults(res);
      setValidated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate signatures');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTrustedCert = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExts = ['.pem', '.crt', '.cer', '.der'];
    if (!validExts.some(ext => file.name.toLowerCase().endsWith(ext))) {
      setError(tTool('errorType'));
      return;
    }

    setTrustedCertFile(file);
    setTrustedCertName(file.name);

    // Re-validate with trusted cert if PDF is loaded
    if (pdfFile) {
      setLoading(true);
      try {
        const forge = (await import('node-forge')).default;
        const content = await file.text();
        let cert;
        if (content.includes('-----BEGIN CERTIFICATE-----')) {
          cert = forge.pki.certificateFromPem(content);
        } else {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const derString = String.fromCharCode.apply(null, Array.from(bytes));
          const asn1 = forge.asn1.fromDer(derString);
          cert = forge.pki.certificateFromAsn1(asn1);
        }

        const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
        const { validatePdfSignatures } = await import('@/lib/pdf/processors/validate-signature');
        const res = await validatePdfSignatures(pdfBytes, cert);
        setResults(res);
        setValidated(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse certificate');
      } finally {
        setLoading(false);
      }
    }
  }, [pdfFile]);

  const handleClear = useCallback(() => {
    setPdfFile(null);
    setResults([]);
    setError(null);
    setValidated(false);
    setTrustedCertFile(null);
    setTrustedCertName(null);
  }, []);

  const formatDate = (d: Date) => {
    if (!d || d.getTime() === 0) return 'Unknown';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      <FileUploader
        accept={['application/pdf', '.pdf']}
        multiple={false}
        maxFiles={1}
        onFilesSelected={handlePdfSelected}
        onError={setError}
        disabled={loading}
        label={tTool('uploadLabel')}
        description={tTool('uploadDescription')}
      />

      {error && (
        <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300" role="alert">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {pdfFile && (
        <Card variant="outlined" size="lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--color-foreground))]">{pdfFile.name}</p>
              <p className="text-xs text-[hsl(var(--color-muted-foreground))]">{(pdfFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={loading}>{t('buttons.remove')}</Button>
          </div>
        </Card>
      )}

      {/* Optional Trusted Certificate */}
      {pdfFile && (
        <Card variant="outlined">
          <h3 className="text-lg font-medium text-[hsl(var(--color-foreground))] mb-3">{tTool('trustedCertTitle')}</h3>
          <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-3">{tTool('trustedCertDescription')}</p>
          <input
            type="file"
            accept=".pem,.crt,.cer,.der"
            onChange={handleTrustedCert}
            disabled={loading}
            className="block w-full text-sm text-[hsl(var(--color-foreground))] file:mr-4 file:py-2 file:px-4 file:rounded-[var(--radius-md)] file:border-0 file:text-sm file:font-medium file:bg-[hsl(var(--color-primary))] file:text-white hover:file:opacity-90 cursor-pointer"
          />
          {trustedCertName && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-2">{tTool('trustedCertLoaded', { name: trustedCertName })}</p>
          )}
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 p-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[hsl(var(--color-primary))]"></div>
          <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{tTool('analyzing')}</p>
        </div>
      )}

      {/* Results */}
      {validated && !loading && (
        <div className="space-y-4">
          {results.length === 0 ? (
            <Card variant="outlined">
              <div className="text-center py-8">
                <svg className="w-12 h-12 mx-auto mb-4 text-[hsl(var(--color-muted-foreground))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-lg font-semibold text-[hsl(var(--color-foreground))] mb-2">{tTool('noSignaturesTitle')}</h3>
                <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{tTool('noSignaturesDescription')}</p>
              </div>
            </Card>
          ) : (
            <>
              {/* Summary */}
              <Card variant="outlined">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                    {tTool('signaturesFound', { count: results.length })}
                  </span>
                  <span className="text-[hsl(var(--color-muted-foreground))]">·</span>
                  <span className={`text-sm ${results.filter(r => r.isValid && !r.isExpired).length === results.length ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                    {tTool('validCount', { count: results.filter(r => r.isValid && !r.isExpired).length })}
                  </span>
                  {trustedCertName && (
                    <>
                      <span className="text-[hsl(var(--color-muted-foreground))]">·</span>
                      <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                        {tTool('trustedCount', { count: results.filter(r => r.isTrusted).length, total: results.length })}
                      </span>
                    </>
                  )}
                </div>
              </Card>

              {/* Signature Cards */}
              {results.map((result, index) => {
                let statusColor = 'text-green-600 dark:text-green-400';
                let statusText = tTool('validSignature');

                if (!result.isValid) {
                  statusColor = 'text-red-600 dark:text-red-400';
                  statusText = tTool('invalidSignature');
                } else if (result.isExpired) {
                  statusColor = 'text-yellow-600 dark:text-yellow-400';
                  statusText = tTool('certificateExpired');
                } else if (result.isSelfSigned) {
                  statusColor = 'text-yellow-600 dark:text-yellow-400';
                  statusText = tTool('selfSigned');
                }

                return (
                  <Card key={index} variant="outlined">
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-[hsl(var(--color-foreground))]">Signature {index + 1}</h4>
                          <p className={`text-sm ${statusColor}`}>{statusText}</p>
                        </div>
                        <div className="flex gap-2">
                          {result.coverageStatus === 'full' && (
                            <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">{tTool('fullCoverage')}</span>
                          )}
                          {result.coverageStatus === 'partial' && (
                            <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">{tTool('partialCoverage')}</span>
                          )}
                          {trustedCertName && (
                            result.isTrusted
                              ? <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">{tTool('trusted')}</span>
                              : <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{tTool('notTrusted')}</span>
                          )}
                        </div>
                      </div>

                      {/* Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-[hsl(var(--color-muted-foreground))]">{tTool('signedBy')}</p>
                          <p className="font-medium text-[hsl(var(--color-foreground))]">{result.signerName}</p>
                          {result.signerOrg && <p className="text-xs text-[hsl(var(--color-muted-foreground))]">{result.signerOrg}</p>}
                          {result.signerEmail && <p className="text-xs text-[hsl(var(--color-muted-foreground))]">{result.signerEmail}</p>}
                        </div>
                        <div>
                          <p className="text-[hsl(var(--color-muted-foreground))]">{tTool('issuer')}</p>
                          <p className="font-medium text-[hsl(var(--color-foreground))]">{result.issuer}</p>
                          {result.issuerOrg && <p className="text-xs text-[hsl(var(--color-muted-foreground))]">{result.issuerOrg}</p>}
                        </div>
                      </div>

                      {result.signatureDate && (
                        <div className="text-sm">
                          <p className="text-[hsl(var(--color-muted-foreground))]">{tTool('signedOn')}</p>
                          <p className="text-[hsl(var(--color-foreground))]">{formatDate(result.signatureDate)}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-[hsl(var(--color-muted-foreground))]">{tTool('validFrom')}</p>
                          <p className="text-[hsl(var(--color-foreground))]">{formatDate(result.validFrom)}</p>
                        </div>
                        <div>
                          <p className="text-[hsl(var(--color-muted-foreground))]">{tTool('validUntil')}</p>
                          <p className={result.isExpired ? 'text-red-600 dark:text-red-400' : 'text-[hsl(var(--color-foreground))]'}>{formatDate(result.validTo)}</p>
                        </div>
                      </div>

                      {result.reason && (
                        <div className="text-sm">
                          <p className="text-[hsl(var(--color-muted-foreground))]">{tTool('reason')}</p>
                          <p className="text-[hsl(var(--color-foreground))]">{result.reason}</p>
                        </div>
                      )}

                      {result.location && (
                        <div className="text-sm">
                          <p className="text-[hsl(var(--color-muted-foreground))]">{tTool('location')}</p>
                          <p className="text-[hsl(var(--color-foreground))]">{result.location}</p>
                        </div>
                      )}

                      {/* Technical Details */}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-[hsl(var(--color-primary))] hover:underline">{tTool('technicalDetails')}</summary>
                        <div className="mt-2 p-3 rounded-[var(--radius-sm)] bg-[hsl(var(--color-muted))] text-xs space-y-1">
                          <p><span className="text-[hsl(var(--color-muted-foreground))]">{tTool('serialNumber')}</span> <span className="font-mono text-[hsl(var(--color-foreground))]">{result.serialNumber}</span></p>
                          <p><span className="text-[hsl(var(--color-muted-foreground))]">{tTool('digestAlgorithm')}</span> <span className="text-[hsl(var(--color-foreground))]">{result.algorithms.digest}</span></p>
                          <p><span className="text-[hsl(var(--color-muted-foreground))]">{tTool('signatureAlgorithm')}</span> <span className="text-[hsl(var(--color-foreground))]">{result.algorithms.signature}</span></p>
                          {result.errorMessage && <p className="text-red-600 dark:text-red-400">Error: {result.errorMessage}</p>}
                        </div>
                      </details>
                    </div>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ValidateSignatureTool;
