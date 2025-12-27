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
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../styles/theme';
import { cameraAPI, wsManager } from '../services/api';
import { Linking } from 'react-native';

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
  const scrollViewRef = useRef(null);

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
    setInputText('');
    setIsLoading(true);

    // Scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const response = await cameraAPI.queryVideos(inputText.trim());
      
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
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
        ]}
      >
        {!isUser && (
          <View style={styles.avatarContainer}>
            <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {message.text}
          </Text>
          {message.relevantClips && message.relevantClips.length > 0 && (
            <View style={styles.clipsContainer}>
              {message.relevantClips.map((clip, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.clipCard}
                  onPress={() => setSelectedVideo(clip)}
                >
                  <Ionicons name="videocam" size={20} color={colors.primary} />
                  <View style={styles.clipInfo}>
                    <Text style={styles.clipTime}>{clip.time_interval}</Text>
                    <Text style={styles.clipFile} numberOfLines={1}>
                      {clip.video_file}
                    </Text>
                  </View>
                  <Ionicons name="play-circle" size={24} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map(renderMessage)}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Thinking...</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ask about your security system..."
          placeholderTextColor={colors.textTertiary}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isLoading}
        >
          <Ionicons
            name="send"
            size={20}
            color={(!inputText.trim() || isLoading) ? colors.textTertiary : colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* Video Player Modal */}
      <Modal
        visible={selectedVideo !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedVideo(null)}
      >
        <View style={styles.videoModal}>
          <View style={styles.videoModalHeader}>
            <Text style={styles.videoModalTitle}>
              {selectedVideo?.time_interval || 'Video Clip'}
            </Text>
            <TouchableOpacity
              onPress={() => setSelectedVideo(null)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={28} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          {selectedVideo && (
            <>
              <View style={styles.videoPlayer}>
                <View style={styles.videoPlaceholder}>
                  <Ionicons name="videocam" size={64} color={colors.textSecondary} />
                  <Text style={styles.videoPlaceholderText}>
                    Video playback for recorded clips
                  </Text>
                  <Text style={styles.videoPlaceholderSubtext}>
                    {selectedVideo.video_file}
                  </Text>
                  <TouchableOpacity
                    style={styles.videoLinkButton}
                    onPress={() => {
                      const videoUrl = cameraAPI.getVideoUrl(selectedVideo.video_file);
                      Linking.openURL(videoUrl).catch((err) =>
                        console.error('Failed to open video URL:', err)
                      );
                    }}
                  >
                    <Ionicons name="open-outline" size={20} color={colors.text} />
                    <Text style={styles.videoLinkButtonText}>Open Video URL</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <ScrollView style={styles.videoDescription}>
                <Text style={styles.videoDescriptionTitle}>Analysis:</Text>
                <Text style={styles.videoDescriptionText}>{selectedVideo.analysis}</Text>
              </ScrollView>
            </>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  assistantMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: borderRadius.xs,
  },
  assistantBubble: {
    backgroundColor: colors.surfaceLight,
    borderBottomLeftRadius: borderRadius.xs,
  },
  messageText: {
    ...typography.body,
    color: colors.text,
  },
  userMessageText: {
    color: colors.text,
  },
  clipsContainer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  clipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.sm,
  },
  clipInfo: {
    flex: 1,
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
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    color: colors.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceLight,
  },
  videoModal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  videoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  videoModalTitle: {
    ...typography.h3,
    color: colors.text,
  },
  closeButton: {
    padding: spacing.xs,
  },
  videoPlayer: {
    width: '100%',
    height: 300,
    backgroundColor: colors.surface,
  },
  videoPlaceholder: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  videoPlaceholderText: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  videoPlaceholderSubtext: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  videoLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  videoLinkButtonText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  videoDescription: {
    flex: 1,
    padding: spacing.md,
  },
  videoDescriptionTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  videoDescriptionText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
});

export default ChatScreen;

