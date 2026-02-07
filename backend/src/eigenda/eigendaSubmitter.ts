import { PriceWindowPayload, EigenDACommitment } from '../types/index.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';

export class EigenDASubmitter {
  private readonly proxyUrl: string;
  private readonly commitmentMode: string;
  private readonly maxRetries = 3;
  private readonly retryDelays = [5000, 10000, 20000]; // 5s, 10s, 20s

  constructor(
    proxyUrl: string = config.eigendaProxyUrl,
    commitmentMode: string = config.eigendaCommitmentMode
  ) {
    this.proxyUrl = proxyUrl;
    this.commitmentMode = commitmentMode;
  }

  /**
   * Submit a price window payload to EigenDA
   */
  public async submitPayload(payload: PriceWindowPayload): Promise<EigenDACommitment> {
    logger.info('Submitting payload to EigenDA', {
      windowStart: payload.windowStart,
      priceCount: payload.prices.length
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const commitment = await this.attemptSubmission(payload);
        
        logger.info('EigenDA submission successful', {
          windowStart: payload.windowStart,
          commitment: commitment.commitment,
          attempt: attempt + 1
        });

        return commitment;

      } catch (error) {
        lastError = error as Error;
        logger.warn('EigenDA submission failed', {
          windowStart: payload.windowStart,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          error: lastError.message
        });

        // If not the last attempt, wait before retrying
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelays[attempt];
          logger.info('Retrying EigenDA submission', {
            delay: `${delay}ms`,
            nextAttempt: attempt + 2
          });
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    logger.error('EigenDA submission failed after all retries', {
      windowStart: payload.windowStart,
      attempts: this.maxRetries,
      error: lastError?.message
    });

    throw new Error(
      `Failed to submit to EigenDA after ${this.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Submit any generic data to EigenDA (for predictions, etc.)
   */
  public async submitData(data: any): Promise<EigenDACommitment> {
    logger.info('Submitting generic data to EigenDA', {
      dataType: data.type || 'unknown'
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const commitment = await this.attemptGenericSubmission(data);
        
        logger.info('EigenDA submission successful', {
          dataType: data.type || 'unknown',
          commitment: commitment.commitment,
          attempt: attempt + 1
        });

        return commitment;

      } catch (error) {
        lastError = error as Error;
        logger.warn('EigenDA submission failed', {
          dataType: data.type || 'unknown',
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          error: lastError.message
        });

        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelays[attempt];
          logger.info('Retrying EigenDA submission', {
            delay: `${delay}ms`,
            nextAttempt: attempt + 2
          });
          await this.sleep(delay);
        }
      }
    }

    logger.error('EigenDA submission failed after all retries', {
      dataType: data.type || 'unknown',
      attempts: this.maxRetries,
      error: lastError?.message
    });

    throw new Error(
      `Failed to submit to EigenDA after ${this.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Attempt a single submission to EigenDA
   */
  private async attemptSubmission(payload: PriceWindowPayload): Promise<EigenDACommitment> {
    // Add commitment_mode query parameter for local EigenDA node
    const endpoint = `${this.proxyUrl}/put?commitment_mode=${this.commitmentMode}`;
    
    // Convert payload to JSON and then to bytes
    const payloadJson = JSON.stringify(payload);
    const payloadBytes = Buffer.from(payloadJson, 'utf-8');

    logger.debug('Sending PUT request to EigenDA', {
      endpoint,
      payloadSize: payloadBytes.length,
      commitmentMode: this.commitmentMode
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: payloadBytes,
    });

    if (!response.ok) {
      throw new Error(
        `EigenDA proxy returned ${response.status}: ${response.statusText}`
      );
    }

    // Parse the response to get the commitment
    const commitmentBytes = await response.arrayBuffer();
    const commitment = Buffer.from(commitmentBytes).toString('hex');

    if (!commitment || commitment.length === 0) {
      throw new Error('EigenDA returned empty commitment');
    }

    logger.debug('EigenDA commitment received', {
      commitment,
      length: commitment.length
    });

    return {
      commitment: `0x${commitment}`,
    };
  }

  /**
   * Attempt a single generic submission to EigenDA
   */
  private async attemptGenericSubmission(data: any): Promise<EigenDACommitment> {
    // Add commitment_mode query parameter for local EigenDA node
    const endpoint = `${this.proxyUrl}/put?commitment_mode=${this.commitmentMode}`;
    
    // Convert data to JSON and then to bytes
    const dataJson = JSON.stringify(data);
    const dataBytes = Buffer.from(dataJson, 'utf-8');

    logger.debug('Sending PUT request to EigenDA', {
      endpoint,
      payloadSize: dataBytes.length,
      commitmentMode: this.commitmentMode
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: dataBytes,
    });

    if (!response.ok) {
      throw new Error(
        `EigenDA proxy returned ${response.status}: ${response.statusText}`
      );
    }

    // Parse the response to get the commitment
    const commitmentBytes = await response.arrayBuffer();
    const commitment = Buffer.from(commitmentBytes).toString('hex');

    if (!commitment || commitment.length === 0) {
      throw new Error('EigenDA returned empty commitment');
    }

    logger.debug('EigenDA commitment received', {
      commitment,
      length: commitment.length
    });

    return {
      commitment: `0x${commitment}`,
    };
  }

  /**
   * Retrieve data from EigenDA using a commitment (with retry logic)
   */
  public async retrieveData(commitment: string): Promise<any> {
    logger.info('Retrieving data from EigenDA', { commitment });

    const maxRetries = 3;
    const retryDelays = [2000, 4000, 8000]; // 2s, 4s, 8s

    // Remove '0x' prefix if present
    const cleanCommitment = commitment.startsWith('0x') 
      ? commitment.slice(2) 
      : commitment;

    // Add commitment_mode query parameter for local EigenDA node
    const endpoint = `${this.proxyUrl}/get/${cleanCommitment}?commitment_mode=${this.commitmentMode}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logger.debug('EigenDA retrieval attempt', {
          commitment,
          attempt: attempt + 1,
          maxRetries
        });

    const response = await fetch(endpoint, {
      method: 'GET',
    });

        // Handle 404 - data not found (don't retry)
        if (response.status === 404) {
          logger.warn('Data not found in EigenDA', { commitment });
          return null;
        }

        // Handle other non-OK responses
    if (!response.ok) {
      throw new Error(
        `EigenDA proxy GET returned ${response.status}: ${response.statusText}`
      );
    }

    const dataBytes = await response.arrayBuffer();
    const dataJson = Buffer.from(dataBytes).toString('utf-8');
        const payload = JSON.parse(dataJson);

    logger.info('Data retrieved from EigenDA', {
      commitment,
          dataType: payload.type || 'unknown',
          attempt: attempt + 1
    });

    return payload;

      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries - 1;
        const is500Error = error.message?.includes('500');

        logger.warn('EigenDA retrieval attempt failed', {
          commitment,
          attempt: attempt + 1,
          maxRetries,
          is500Error,
          error: error.message || error.toString()
        });

        if (isLastAttempt) {
          logger.error('Failed to retrieve from EigenDA after all retries', {
            commitment,
            attempts: maxRetries,
            error
          });
          throw error;
        }

        // Wait before retry with exponential backoff
        const delay = retryDelays[attempt];
        logger.info('Retrying EigenDA retrieval', {
          commitment,
          nextAttempt: attempt + 2,
          delayMs: delay
        });
        await this.sleep(delay);
      }
    }

    throw new Error('Failed to retrieve from EigenDA: max retries exceeded');
  }

  /**
   * Test the EigenDA connection
   */
  public async testConnection(): Promise<boolean> {
    try {
      const testPayload: PriceWindowPayload = {
        windowStart: Math.floor(Date.now() / 1000),
        windowEnd: Math.floor(Date.now() / 1000) + 59,
        prices: Array(60).fill(1.2),
        lastPrice: 1.2,
        bid: 1.19,
        ask: 1.21,
        twap: 1.2,
        volatility: 0.001
      };

      const commitment = await this.submitPayload(testPayload);
      logger.info('EigenDA connection test successful', { commitment });
      return true;

    } catch (error) {
      logger.error('EigenDA connection test failed', error);
      return false;
    }
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default EigenDASubmitter;

