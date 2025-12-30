import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { colors, spacing, typography, borderRadius, shadows } from '../styles/theme';
import { cameraAPI, wsManager } from '../services/api';

const ChatScreen = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'assistant',
      text: "Hello! I'm your security assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoError, setVideoError] = useState(null);
  const [showInputModal, setShowInputModal] = useState(false);
  const scrollViewRef = useRef(null);
  const vlcPlayerRef = useRef(null);
  const inputRef = useRef(null);

  // Update video URL when selected video changes
  useEffect(() => {
    if (selectedVideo && selectedVideo.video_file) {
      const url = cameraAPI.getVideoUrl(selectedVideo.video_file);
      setVideoUrl(url);
      setVideoError(null);
    } else {
      setVideoUrl(null);
    }
  }, [selectedVideo]);

  // Auto-focus input when modal opens and blur bottom input
  useEffect(() => {
    if (showInputModal) {
      // Blur the bottom input
      inputRef.current?.blur();
      // Focus will happen automatically via autoFocus prop
    }
  }, [showInputModal]);

  useEffect(() => {
    // Set up WebSocket for real-time updates
    const handleMessage = (data) => {
      if (data.type === 'motion') {
        // Could add motion status updates here if needed
      } else if (data.type === 'progress') {
        // Could add progress updates here if needed
      }
    };

    wsManager.connect(handleMessage, (error) => {
      console.error('WebSocket error:', error);
    });

    return () => {
      wsManager.disconnect();
    };
  }, []);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: inputText.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const queryText = inputText.trim();
    setInputText('');
    setShowInputModal(false);
    setIsLoading(true);

    // Scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const response = await cameraAPI.queryVideos(queryText);
      
      let assistantText = '';
      let relevantClips = [];

      if (response.answer) {
        assistantText = response.answer;
      }

      if (response.relevant_clips && response.relevant_clips.length > 0) {
        relevantClips = response.relevant_clips;
        assistantText += '\n\n📹 Found ' + relevantClips.length + ' relevant video clip(s).';
      } else if (!response.answer || response.answer.includes('NOT_FOUND')) {
        assistantText = "I couldn't find any relevant information in the processed video clips for your query.";
      }

      const assistantMessage = {
        id: Date.now() + 1,
        type: 'assistant',
        text: assistantText,
        timestamp: new Date(),
        relevantClips: relevantClips,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error querying videos:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'assistant',
        text: "Sorry, I encountered an error processing your query. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = (message) => {
    const isUser = message.type === 'user';
    
    return (
      <View
        key={message.id}
        style={[
          styles.messageWrapper,
          isUser ? styles.userMessageWrapper : styles.assistantMessageWrapper,
        ]}
      >
        {!isUser && (
          <View style={styles.avatarContainer}>
            <View style={styles.avatarInner}>
              <Ionicons name="shield-checkmark" size={20} color={colors.text} />
            </View>
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
            isUser && shadows.md,
          ]}
        >
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {message.text}
          </Text>
          {message.relevantClips && message.relevantClips.length > 0 && (
            <View style={styles.clipsContainer}>
              <Text style={styles.clipsLabel}>📹 Relevant Clips:</Text>
              {message.relevantClips.map((clip, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.clipCard}
                  onPress={() => setSelectedVideo(clip)}
                  activeOpacity={0.7}
                >
                  <View style={styles.clipIconContainer}>
                    <Ionicons name="videocam" size={18} color={colors.textSecondary} />
                  </View>
                  <View style={styles.clipInfo}>
                    <Text style={styles.clipTime} numberOfLines={1}>
                      {clip.time_interval}
                    </Text>
                    <Text style={styles.clipFile} numberOfLines={1}>
                      {clip.video_file}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        {isUser && (
          <View style={styles.avatarContainer}>
            <View style={[styles.avatarInner, styles.userAvatar]}>
              <Ionicons name="person" size={18} color={colors.textSecondary} />
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="shield-checkmark" size={24} color={colors.text} />
            </View>
            <Text style={styles.headerTitle}>Security Assistant</Text>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.keyboardAvoidingView}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => {
            if (messages.length > 0) {
              setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
              }, 100);
            }
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
        >
          {messages.map(renderMessage)}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <View style={styles.loadingBubble}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>Thinking...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Bottom Input Container */}
        <View style={[styles.inputContainer, shadows.lg]}>
          <View style={styles.inputWrapper}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Ask about your security system..."
              placeholderTextColor={colors.textTertiary}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              textAlignVertical="top"
              onFocus={() => setShowInputModal(true)}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Ionicons
                  name="send"
                  size={20}
                  color={(!inputText.trim() || isLoading) ? colors.textTertiary : '#000000'}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Input Modal at Top - Android Only */}
      <Modal
        visible={showInputModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowInputModal(false);
        }}
      >
        <SafeAreaView style={styles.inputModalOverlay} edges={['top']}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => {
              setShowInputModal(false);
              inputRef.current?.blur();
            }}
          />
          <View style={[styles.inputModalContainer, { minHeight: Math.min(200, 80 + (inputText.split('\n').length * 22)) }]}>
            <View style={styles.inputModalHeader}>
              <Text style={styles.inputModalTitle}>Ask a Question</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowInputModal(false);
                  inputRef.current?.blur();
                }}
                style={styles.closeModalButton}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.inputModalContent}>
              <TextInput
                ref={inputRef}
                style={styles.inputModalInput}
                placeholder="Ask about your security system..."
                placeholderTextColor={colors.textTertiary}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
                textAlignVertical="top"
                autoFocus={true}
              />
              <TouchableOpacity
                style={[
                  styles.inputModalSendButton,
                  (!inputText.trim() || isLoading) && styles.inputModalSendButtonDisabled,
                ]}
                onPress={handleSend}
                disabled={!inputText.trim() || isLoading}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Ionicons
                    name="send"
                    size={20}
                    color={(!inputText.trim() || isLoading) ? colors.textTertiary : '#000000'}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Modern Video Player Modal */}
      <Modal
        visible={selectedVideo !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setSelectedVideo(null);
          setVideoUrl(null);
        }}
        statusBarTranslucent={false}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top']}>
          <View style={styles.videoModal}>
            <View style={styles.videoModalHeader}>
              <View style={styles.modalHeaderContent}>
                <View style={styles.modalIconContainer}>
                  <Ionicons name="videocam" size={20} color={colors.text} />
                </View>
                <View style={styles.modalHeaderText}>
                  <Text style={styles.videoModalTitle}>Video Analysis</Text>
                  <Text style={styles.videoModalSubtitle}>
                    {selectedVideo?.time_interval || 'Clip'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setSelectedVideo(null);
                  setVideoUrl(null);
                }}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <View style={styles.closeButtonInner}>
                  <Ionicons name="close" size={20} color={colors.text} />
                </View>
              </TouchableOpacity>
            </View>

            {selectedVideo && (
              <ScrollView
                style={styles.modalContent}
                contentContainerStyle={styles.modalContentContainer}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.videoPlayerContainer}>
                  {videoUrl ? (
                    <>
                      <VLCPlayer
                        ref={vlcPlayerRef}
                        style={styles.videoPlayer}
                        source={{ uri: videoUrl }}
                        autoplay={true}
                        onError={(e) => {
                          console.error('VLC Player Error:', e);
                          setVideoError(`Failed to play video. Please check your connection.`);
                        }}
                        onLoadStart={() => {
                          console.log('VLC Player: Load start');
                        }}
                        onPlaying={() => {
                          console.log('VLC Player: Playing');
                          setVideoError(null);
                        }}
                        onBuffering={(event) => {
                          console.log('VLC Player: Buffering', event);
                        }}
                        onEnd={() => {
                          console.log('VLC Player: Video playback ended');
                        }}
                      />
                      {videoError && (
                        <View style={styles.videoErrorContainer}>
                          <Ionicons name="alert-circle" size={20} color={colors.accent} />
                          <Text style={styles.videoErrorText}>{videoError}</Text>
                        </View>
                      )}
                    </>
                  ) : (
                    <View style={styles.videoPlaceholder}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={styles.videoPlaceholderText}>Loading video...</Text>
                    </View>
                  )}
                  
                  <View style={styles.videoInfoCard}>
                    <View style={styles.videoInfoRow}>
                      <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.videoInfoLabel}>Time Interval:</Text>
                      <Text style={styles.videoInfoValue} numberOfLines={1}>
                        {selectedVideo.time_interval || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.videoInfoRow}>
                      <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.videoInfoLabel}>File:</Text>
                      <Text style={styles.videoInfoValue} numberOfLines={1}>
                        {selectedVideo.video_file}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.analysisCard}>
                  <View style={styles.analysisHeader}>
                    <Ionicons name="analytics-outline" size={20} color={colors.textSecondary} />
                    <Text style={styles.analysisTitle}>AI Analysis</Text>
                  </View>
                  <Text style={styles.analysisText}>
                    {selectedVideo.analysis || 'No analysis available.'}
                  </Text>
                </View>
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.text,
    fontWeight: '700',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: 120, // Enough space for input bar
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    alignItems: 'flex-end',
  },
  userMessageWrapper: {
    justifyContent: 'flex-end',
  },
  assistantMessageWrapper: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 32,
    height: 32,
    marginHorizontal: spacing.xs,
  },
  avatarInner: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatar: {
    backgroundColor: colors.surface,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: borderRadius.sm,
  },
  assistantBubble: {
    backgroundColor: colors.surfaceElevated,
    borderBottomLeftRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#000000', // Black text on white background
  },
  clipsContainer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  clipsLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  clipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clipIconContainer: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clipInfo: {
    flex: 1,
    gap: 2,
  },
  clipTime: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  clipFile: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  loadingContainer: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    justifyContent: 'flex-start',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  inputContainer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary, // White in dark theme
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceElevated,
    opacity: 0.5,
  },
  // Input Modal Styles
  inputModalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  inputModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    ...shadows.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  inputModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  inputModalTitle: {
    ...typography.h3,
    color: colors.text,
    fontWeight: '700',
  },
  closeModalButton: {
    padding: spacing.xs,
  },
  inputModalContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  inputModalInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 200,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  inputModalSendButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputModalSendButtonDisabled: {
    backgroundColor: colors.surfaceElevated,
    opacity: 0.5,
  },
  // Video Modal Styles
  modalSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  videoModal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  videoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  modalIconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeaderText: {
    flex: 1,
  },
  videoModalTitle: {
    ...typography.h3,
    color: colors.text,
    fontWeight: '700',
  },
  videoModalSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    padding: spacing.xs,
  },
  closeButtonInner: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  videoPlayerContainer: {
    marginBottom: spacing.md,
  },
  videoPlayer: {
    width: '100%',
    height: 250,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    // Removed backgroundColor - VLC Player's TextureView doesn't support it
  },
  videoPlaceholder: {
    width: '100%',
    height: 250,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  videoPlaceholderText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  videoErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent + '20',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent + '40',
  },
  videoErrorText: {
    ...typography.bodySmall,
    color: colors.accent,
    flex: 1,
  },
  videoInfoCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  videoInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  videoInfoLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  videoInfoValue: {
    ...typography.bodySmall,
    color: colors.text,
    flex: 1,
    fontWeight: '600',
  },
  analysisCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  analysisTitle: {
    ...typography.h3,
    color: colors.text,
    fontWeight: '600',
  },
  analysisText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
});

export default ChatScreen;
