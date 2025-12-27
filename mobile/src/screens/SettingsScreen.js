import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../styles/theme';
import { cameraAPI, wsManager } from '../services/api';

const SettingsScreen = () => {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [useRtsp, setUseRtsp] = useState(false);
  const [rtspUrl, setRtspUrl] = useState('');
  const [rtspUsername, setRtspUsername] = useState('');
  const [rtspPassword, setRtspPassword] = useState('');
  const [motionThreshold, setMotionThreshold] = useState(5000);
  const [isStreaming, setIsStreaming] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [secondsProcessed, setSecondsProcessed] = useState(0);
  const [clipsProcessed, setClipsProcessed] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCameras();
    loadStatus();
    loadProgress();

    // Set up WebSocket for real-time updates
    const handleMessage = (data) => {
      if (data.type === 'motion') {
        setMotionDetected(data.motion_detected || false);
      } else if (data.type === 'status') {
        setIsStreaming(data.is_streaming || false);
        setIsRecording(data.is_recording || false);
        setMotionDetected(data.motion_detected || false);
      } else if (data.type === 'progress') {
        setSecondsProcessed(data.seconds_processed || 0);
        setClipsProcessed(data.clips_processed || 0);
      }
    };

    wsManager.connect(handleMessage, (error) => {
      console.error('WebSocket error:', error);
    });

    // Poll for status updates
    const statusInterval = setInterval(() => {
      loadStatus();
      loadProgress();
    }, 2000);

    return () => {
      clearInterval(statusInterval);
      wsManager.disconnect();
    };
  }, []);

  const loadCameras = async () => {
    try {
      const cameraList = await cameraAPI.listCameras();
      setCameras(cameraList);
    } catch (error) {
      console.error('Error loading cameras:', error);
    }
  };

  const loadStatus = async () => {
    try {
      const status = await cameraAPI.getStatus();
      setIsStreaming(status.is_streaming || false);
      setIsRecording(status.is_recording || false);
      setMotionDetected(status.motion_detected || false);
      if (status.camera_index !== null && status.camera_index !== undefined) {
        setSelectedCamera(status.camera_index.toString());
        setUseRtsp(false);
      } else if (status.rtsp_url) {
        setRtspUrl(status.rtsp_url);
        setUseRtsp(true);
      }
    } catch (error) {
      console.error('Error loading status:', error);
    }
  };

  const loadProgress = async () => {
    try {
      const progress = await cameraAPI.getProgress();
      setSecondsProcessed(progress.seconds_processed || 0);
      setClipsProcessed(progress.clips_processed || 0);
    } catch (error) {
      console.error('Error loading progress:', error);
    }
  };

  const handleStartStream = async () => {
    if (!useRtsp && !selectedCamera) {
      Alert.alert('Error', 'Please select a camera or enter an RTSP URL');
      return;
    }
    if (useRtsp && !rtspUrl.trim()) {
      Alert.alert('Error', 'Please enter an RTSP URL');
      return;
    }

    setLoading(true);
    try {
      const cameraIndex = useRtsp ? null : parseInt(selectedCamera);
      let finalRtspUrl = null;

      if (useRtsp) {
        let url = rtspUrl.trim();
        if (rtspUsername.trim() || rtspPassword.trim()) {
          url = url.replace(/rtsp:\/\/(.*?@)?/, 'rtsp://');
          const authPart = `${rtspUsername.trim()}:${rtspPassword.trim()}`;
          url = url.replace('rtsp://', `rtsp://${authPart}@`);
        }
        finalRtspUrl = url;
      }

      await cameraAPI.startStream(cameraIndex, motionThreshold, finalRtspUrl);
      setIsStreaming(true);
      await loadProgress();
    } catch (error) {
      Alert.alert('Error', 'Failed to start stream: ' + (error.response?.data?.detail || error.message));
      console.error('Error starting stream:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStopStream = async () => {
    setLoading(true);
    try {
      await cameraAPI.stopStream();
      setIsStreaming(false);
      setIsRecording(false);
      setMotionDetected(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to stop stream: ' + (error.response?.data?.detail || error.message));
      console.error('Error stopping stream:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearDatabase = () => {
    Alert.alert(
      'Clear Database',
      'Are you sure you want to clear all stored video analyses? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await cameraAPI.clearDatabase();
              Alert.alert('Success', 'Database cleared successfully');
              setSecondsProcessed(0);
              setClipsProcessed(0);
            } catch (error) {
              Alert.alert('Error', 'Failed to clear database: ' + (error.response?.data?.detail || error.message));
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Status Cards */}
      <View style={styles.statusCards}>
        <View style={styles.statusCard}>
          <Text style={styles.statusCardTitle}>Clips Processed</Text>
          <Text style={styles.statusCardValue}>{clipsProcessed}</Text>
          <Text style={styles.statusCardSubtitle}>Total video clips analyzed</Text>
        </View>
        <View style={styles.statusCard}>
          <Text style={styles.statusCardTitle}>Seconds Processed</Text>
          <Text style={styles.statusCardValue}>{secondsProcessed}s</Text>
          <Text style={styles.statusCardSubtitle}>Total video time analyzed</Text>
        </View>
      </View>

      {/* Stream Status */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="videocam" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>Stream Status</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Streaming:</Text>
          <View style={[styles.statusIndicator, isStreaming && styles.statusIndicatorActive]}>
            <Text style={styles.statusText}>{isStreaming ? 'Active' : 'Inactive'}</Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Motion Detected:</Text>
          <View style={[styles.statusIndicator, motionDetected && styles.statusIndicatorActive]}>
            <Text style={styles.statusText}>{motionDetected ? 'Yes' : 'No'}</Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Recording:</Text>
          <View style={[styles.statusIndicator, isRecording && styles.statusIndicatorActive]}>
            <Text style={styles.statusText}>{isRecording ? 'Yes' : 'No'}</Text>
          </View>
        </View>
      </View>

      {/* Camera Selection */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="camera" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>Camera Source</Text>
        </View>
        
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Use RTSP Stream</Text>
          <Switch
            value={useRtsp}
            onValueChange={setUseRtsp}
            disabled={isStreaming}
            trackColor={{ false: colors.surfaceLight, true: colors.primary }}
            thumbColor={colors.text}
          />
        </View>

        {useRtsp ? (
          <>
            <Text style={styles.label}>RTSP Stream URL</Text>
            <TextInput
              style={styles.input}
              placeholder="rtsp://ip:port/path"
              placeholderTextColor={colors.textTertiary}
              value={rtspUrl}
              onChangeText={setRtspUrl}
              editable={!isStreaming}
              autoCapitalize="none"
            />
            <Text style={styles.label}>Username (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="RTSP Username"
              placeholderTextColor={colors.textTertiary}
              value={rtspUsername}
              onChangeText={setRtspUsername}
              editable={!isStreaming}
              autoCapitalize="none"
            />
            <Text style={styles.label}>Password (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="RTSP Password"
              placeholderTextColor={colors.textTertiary}
              value={rtspPassword}
              onChangeText={setRtspPassword}
              editable={!isStreaming}
              secureTextEntry
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>Select Camera</Text>
            <ScrollView style={styles.cameraList}>
              {cameras.map((cam) => (
                <TouchableOpacity
                  key={cam.index}
                  style={[
                    styles.cameraOption,
                    selectedCamera === cam.index.toString() && styles.cameraOptionSelected,
                  ]}
                  onPress={() => setSelectedCamera(cam.index.toString())}
                  disabled={isStreaming}
                >
                  <Ionicons
                    name="videocam-outline"
                    size={20}
                    color={selectedCamera === cam.index.toString() ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.cameraOptionText,
                      selectedCamera === cam.index.toString() && styles.cameraOptionTextSelected,
                    ]}
                  >
                    {cam.name} (Index: {cam.index})
                  </Text>
                  {selectedCamera === cam.index.toString() && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
      </View>

      {/* Motion Detection */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="pulse" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>Motion Detection</Text>
        </View>
        <Text style={styles.label}>Motion Threshold: {motionThreshold}</Text>
        <Text style={styles.hint}>Lower = more sensitive (default: 5000)</Text>
        <View style={styles.sliderContainer}>
          <Text style={styles.sliderValue}>{motionThreshold}</Text>
          <View style={styles.sliderTrack}>
            <TouchableOpacity
              style={[
                styles.sliderThumb,
                { left: `${((motionThreshold - 1000) / 19000) * 100}%` },
              ]}
              disabled={isStreaming}
            />
          </View>
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>1000</Text>
            <Text style={styles.sliderLabel}>20000</Text>
          </View>
        </View>
        <View style={styles.sliderButtons}>
          <TouchableOpacity
            style={styles.sliderButton}
            onPress={() => setMotionThreshold(Math.max(1000, motionThreshold - 500))}
            disabled={isStreaming}
          >
            <Ionicons name="remove" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sliderButton}
            onPress={() => setMotionThreshold(Math.min(20000, motionThreshold + 500))}
            disabled={isStreaming}
          >
            <Ionicons name="add" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="settings" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>Controls</Text>
        </View>
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary, isStreaming && styles.buttonDisabled]}
          onPress={handleStartStream}
          disabled={isStreaming || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Ionicons name="play" size={20} color={colors.text} />
              <Text style={styles.buttonText}>Start Streaming</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary, !isStreaming && styles.buttonDisabled]}
          onPress={handleStopStream}
          disabled={!isStreaming || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Ionicons name="stop" size={20} color={colors.text} />
              <Text style={styles.buttonText}>Stop Streaming</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonDanger]}
          onPress={handleClearDatabase}
        >
          <Ionicons name="trash" size={20} color={colors.text} />
          <Text style={styles.buttonText}>Clear Database</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  statusCards: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statusCard: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  statusCardTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statusCardValue: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  statusCardSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  statusIndicator: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
  },
  statusIndicatorActive: {
    backgroundColor: colors.success,
  },
  statusText: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  switchLabel: {
    ...typography.body,
    color: colors.text,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  cameraList: {
    maxHeight: 200,
  },
  cameraOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  cameraOptionSelected: {
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  cameraOptionText: {
    ...typography.body,
    flex: 1,
    color: colors.textSecondary,
  },
  cameraOptionTextSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  sliderContainer: {
    marginVertical: spacing.md,
  },
  sliderValue: {
    ...typography.h3,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  sliderTrack: {
    height: 4,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    position: 'relative',
    marginBottom: spacing.sm,
  },
  sliderThumb: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    position: 'absolute',
    top: -8,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  sliderButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
  },
  sliderButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceLight,
  },
  buttonDanger: {
    backgroundColor: colors.accent,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
});

export default SettingsScreen;

