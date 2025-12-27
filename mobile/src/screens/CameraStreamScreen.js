import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../styles/theme';
import { cameraAPI, wsManager } from '../services/api';

const CameraStreamScreen = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [rtspUrl, setRtspUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const vlcPlayer = useRef(null);

  useEffect(() => {
    // Set up WebSocket for real-time updates
    const handleMessage = (data) => {
      if (data.type === 'motion') {
        setMotionDetected(data.motion_detected || false);
      } else if (data.type === 'status') {
        setIsStreaming(data.is_streaming || false);
        setIsRecording(data.is_recording || false);
        setMotionDetected(data.motion_detected || false);
      }
    };

    wsManager.connect(handleMessage, (error) => {
      console.error('WebSocket error:', error);
    });

    // Load initial status
    loadStatus();

    // Poll for status updates
    const statusInterval = setInterval(() => {
      loadStatus();
    }, 2000);

    return () => {
      clearInterval(statusInterval);
      wsManager.disconnect();
      setRtspUrl(null);
    };
  }, []);

  const loadStatus = async () => {
    try {
      const status = await cameraAPI.getStatus();
      setIsStreaming(status.is_streaming || false);
      setIsRecording(status.is_recording || false);
      setMotionDetected(status.motion_detected || false);
      
      if (status.is_streaming && status.rtsp_url) {
        // Use RTSP URL directly for VLC player
        console.log('Stream is active, RTSP URL:', status.rtsp_url);
        setRtspUrl(status.rtsp_url);
      } else if (status.is_streaming && status.camera_index !== null) {
        // For camera streams, we would need to convert to RTSP or use HLS
        // For now, show error message
        setError('Camera streams require RTSP conversion. Please use an RTSP URL in Settings.');
        setRtspUrl(null);
      } else {
        console.log('Stream is not active');
        setRtspUrl(null);
      }
    } catch (error) {
      console.error('Error loading status:', error);
    }
  };

  const handleStartStream = async () => {
    // Check if stream is already configured
    try {
      const status = await cameraAPI.getStatus();
      if (status.is_streaming && status.rtsp_url) {
        setRtspUrl(status.rtsp_url);
        setIsStreaming(true);
        return;
      }
    } catch (error) {
      // Status check failed, proceed with start
    }

    Alert.alert(
      'Start Stream',
      'Please configure the RTSP URL in Settings first, then start streaming from there.',
      [{ text: 'OK' }]
    );
  };

  const handleStopStream = async () => {
    setLoading(true);
    setError(null);
    try {
      await cameraAPI.stopStream();
      setIsStreaming(false);
      setIsRecording(false);
      setMotionDetected(false);
      setRtspUrl(null);
    } catch (error) {
      setError('Failed to stop stream: ' + (error.response?.data?.detail || error.message));
      console.error('Error stopping stream:', error);
    } finally {
      setLoading(false);
    }
  };

  const onVLCError = (error) => {
    console.error('VLC Player Error:', error);
    setError('Failed to stream video. Please check the RTSP URL and network connection.');
  };

  const onVLCLoading = (buffering) => {
    console.log('VLC Buffering:', buffering);
    setLoading(buffering.isBuffering);
  };

  const onVLCPlaying = () => {
    console.log('VLC Playing');
    setLoading(false);
    setError(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, isStreaming && styles.statusDotActive]} />
          <Text style={styles.statusText}>
            {isStreaming ? 'Streaming' : 'Not Streaming'}
          </Text>
        </View>
        {motionDetected && (
          <View style={styles.statusItem}>
            <Ionicons name="pulse" size={16} color={colors.accent} />
            <Text style={[styles.statusText, styles.motionText]}>Motion Detected</Text>
          </View>
        )}
        {isRecording && (
          <View style={styles.statusItem}>
            <View style={styles.recordingDot} />
            <Text style={[styles.statusText, styles.recordingText]}>Recording</Text>
          </View>
        )}
      </View>

      {/* Video Stream Area */}
      <View style={styles.videoContainer}>
        {rtspUrl && isStreaming ? (
          <VLCPlayer
            ref={vlcPlayer}
            style={styles.videoStream}
            source={{ uri: rtspUrl }}
            autoplay={true}
            onError={onVLCError}
            onBuffering={onVLCLoading}
            onPlaying={onVLCPlaying}
          />
        ) : (
          <View style={styles.placeholderContainer}>
            <Ionicons name="videocam-outline" size={64} color={colors.textTertiary} />
            <Text style={styles.placeholderText}>
              {isStreaming ? 'Starting stream...' : 'No active stream'}
            </Text>
            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}
            {loading && (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            )}
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {!isStreaming ? (
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleStartStream}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="play" size={20} color={colors.text} />
                <Text style={styles.buttonText}>Start Stream</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={handleStopStream}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="stop" size={20} color={colors.text} />
                <Text style={styles.buttonText}>Stop Stream</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        <Text style={styles.hint}>
          Configure RTSP URL in Settings before starting
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusBar: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.textTertiary,
  },
  statusDotActive: {
    backgroundColor: colors.success,
  },
  statusText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  motionText: {
    color: colors.accent,
    fontWeight: '600',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
  },
  recordingText: {
    color: colors.accent,
    fontWeight: '600',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoStream: {
    width: '100%',
    height: '100%',
  },
  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  placeholderText: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.accent,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  loader: {
    marginTop: spacing.md,
  },
  controls: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    minWidth: 200,
    gap: spacing.sm,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceLight,
  },
  buttonText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  hint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});

export default CameraStreamScreen;
