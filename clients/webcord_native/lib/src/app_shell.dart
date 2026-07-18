import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import 'app_state.dart';
import 'app_theme.dart';
import 'models.dart';

class WebCordShell extends StatelessWidget {
  const WebCordShell({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    if (state.initializing) {
      return const Material(
        type: MaterialType.transparency,
        child: AppBackdrop(child: Center(child: CircularProgressIndicator())),
      );
    }

    return Material(
      type: MaterialType.transparency,
      child: AppBackdrop(
        child: SafeArea(
          child: Stack(
            children: [
              if (!state.isAuthed)
                AuthScreen(state: state)
              else
                LayoutBuilder(
                  builder: (context, constraints) {
                    if (constraints.maxWidth >= 980) {
                      return DesktopShell(state: state);
                    }
                    return MobileShell(state: state);
                  },
                ),
              if (state.isAuthed && state.voiceJoined)
                Positioned(
                  left: MediaQuery.sizeOf(context).width < 980 ? 12 : null,
                  right: 12,
                  bottom: MediaQuery.sizeOf(context).width < 980 ? 92 : 12,
                  child: VoiceMiniPanel(state: state),
                ),
              if (state.isAuthed && state.incomingCall != null)
                Positioned(
                  left: 12,
                  right: 12,
                  top: 12,
                  child: IncomingCallBanner(state: state),
                ),
              if (state.error != null)
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 16,
                  child: ErrorToast(
                    message: state.error!,
                    onClose: state.clearError,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class AuthScreen extends StatefulWidget {
  const AuthScreen({required this.state, super.key});

  final WebCordState state;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _register = false;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(22),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 920),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (MediaQuery.sizeOf(context).width > 820)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(right: 44),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const BrandLockup(size: 42),
                        const SizedBox(height: 36),
                        Text(
                          'Chat groups,\nwhere it is\nalways fun',
                          style: Theme.of(context).textTheme.headlineLarge
                              ?.copyWith(fontSize: 54, letterSpacing: 0),
                        ),
                        const SizedBox(height: 18),
                        const Text(
                          'Native WebCord keeps channels, friends, direct messages and voice rooms close without opening a browser.',
                          style: TextStyle(
                            color: Color(0xFFD8DDEE),
                            fontSize: 16,
                            height: 1.45,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              Flexible(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 380),
                  child: Panel(
                    padding: const EdgeInsets.all(22),
                    color: WebCordColors.panel.withAlpha(242),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const BrandLockup(size: 32),
                        const SizedBox(height: 24),
                        Text(
                          _register ? 'Create account' : 'Welcome back',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Connect to webcordes.ru and continue in a native client.',
                          style: TextStyle(color: WebCordColors.muted),
                        ),
                        const SizedBox(height: 22),
                        TextField(
                          controller: _username,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                            hintText: 'Username',
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _password,
                          obscureText: true,
                          onSubmitted: (_) => _submit(),
                          decoration: const InputDecoration(
                            hintText: 'Password',
                          ),
                        ),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: widget.state.busy ? null : _submit,
                            icon: widget.state.busy
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.login_rounded),
                            label: Text(
                              _register ? 'Create WebCord' : 'Enter WebCord',
                            ),
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextButton(
                          onPressed: () =>
                              setState(() => _register = !_register),
                          child: Text(
                            _register
                                ? 'Already have an account? Sign in'
                                : 'Need an account? Register',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _submit() {
    final username = _username.text.trim();
    final password = _password.text;
    if (username.isEmpty || password.isEmpty) return;
    if (_register) {
      widget.state.register(username, password);
    } else {
      widget.state.login(username, password);
    }
  }
}

class DesktopShell extends StatelessWidget {
  const DesktopShell({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _DesktopPaneEntrance(
          delay: Duration.zero,
          offset: const Offset(-.18, 0),
          child: ServerRail(state: state),
        ),
        _DesktopPaneEntrance(
          delay: const Duration(milliseconds: 70),
          offset: const Offset(-.1, 0),
          child: SizedBox(width: 410, child: Sidebar(state: state)),
        ),
        Expanded(
          child: _DesktopPaneEntrance(
            delay: const Duration(milliseconds: 130),
            offset: const Offset(.02, .035),
            child: MainSurface(state: state),
          ),
        ),
      ],
    );
  }
}

class _DesktopPaneEntrance extends StatefulWidget {
  const _DesktopPaneEntrance({
    required this.child,
    required this.delay,
    required this.offset,
  });

  final Widget child;
  final Duration delay;
  final Offset offset;

  @override
  State<_DesktopPaneEntrance> createState() => _DesktopPaneEntranceState();
}

class _DesktopPaneEntranceState extends State<_DesktopPaneEntrance> {
  bool _visible = false;

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(widget.delay, () {
      if (mounted) setState(() => _visible = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final disableAnimations =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final visible = _visible || disableAnimations;
    return AnimatedSlide(
      offset: visible ? Offset.zero : widget.offset,
      duration: wcBaseMotion,
      curve: wcEase,
      child: AnimatedOpacity(
        opacity: visible ? 1 : 0,
        duration: wcBaseMotion,
        curve: wcEase,
        child: widget.child,
      ),
    );
  }
}

class MobileShell extends StatelessWidget {
  const MobileShell({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final showLists =
        state.workspace == WorkspaceKind.friends ||
        (state.workspace == WorkspaceKind.server &&
            state.selectedTextChannelId == null) ||
        (state.workspace == WorkspaceKind.direct &&
            state.selectedConversationId == null);
    final showQuickSwitch =
        state.workspace == WorkspaceKind.server ||
        state.workspace == WorkspaceKind.direct;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        toolbarHeight: 74,
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: palette.bg.withAlpha(242),
        leading: IconButton(
          tooltip: 'Channels and calls',
          onPressed: () => showMobileNavigationSheet(context, state),
          icon: const Icon(Icons.menu_rounded),
        ),
        titleSpacing: 4,
        title: Row(
          children: [
            const BrandMark(size: 34),
            const SizedBox(width: 8),
            Text(
              'WebCord',
              style: TextStyle(
                color: palette.text,
                fontWeight: FontWeight.w900,
                fontSize: 17,
              ),
            ),
            Container(
              width: 1,
              height: 28,
              margin: const EdgeInsets.symmetric(horizontal: 10),
              color: palette.border,
            ),
            Expanded(
              child: Text(
                state.workspace == WorkspaceKind.server
                    ? '# ${state.activeTextChannel?.name ?? state.title}'
                    : state.title,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 17,
                ),
              ),
            ),
          ],
        ),
        actions: [
          if (state.workspace == WorkspaceKind.server)
            IconButton(
              tooltip: 'Voice rooms',
              onPressed: () => showMobileVoiceSheet(context, state),
              icon: Icon(
                state.voiceJoined
                    ? Icons.call_rounded
                    : Icons.graphic_eq_rounded,
                color: state.voiceJoined ? WebCordColors.success : null,
              ),
            ),
          IconButton(
            tooltip: 'Settings',
            onPressed: () => showSettingsDialog(context, state),
            icon: const Icon(Icons.settings_rounded),
          ),
          IconButton(
            tooltip: 'Logout',
            onPressed: state.logout,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: AnimatedSwitcher(
        duration: wcBaseMotion,
        switchInCurve: wcEase,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) {
          return FadeTransition(
            opacity: animation,
            child: SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(.025, .015),
                end: Offset.zero,
              ).animate(animation),
              child: child,
            ),
          );
        },
        child: KeyedSubtree(
          key: ValueKey('${state.workspace}-$showLists'),
          child: showLists
              ? Sidebar(state: state, compact: true)
              : Column(
                  children: [
                    if (showQuickSwitch) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                        child: MobileQuickSwitch(state: state),
                      ),
                    ],
                    Expanded(child: MainSurface(state: state)),
                  ],
                ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: palette.bg.withAlpha(246),
        indicatorColor: palette.accent.withAlpha(72),
        selectedIndex: switch (state.workspace) {
          WorkspaceKind.direct || WorkspaceKind.friends => 0,
          WorkspaceKind.server => 1,
          WorkspaceKind.calls => 2,
          WorkspaceKind.stories => 3,
          WorkspaceKind.profile => 4,
        },
        onDestinationSelected: (index) {
          final next = [
            WorkspaceKind.direct,
            WorkspaceKind.server,
            WorkspaceKind.calls,
            WorkspaceKind.stories,
            WorkspaceKind.profile,
          ][index];
          state.selectWorkspace(next);
        },
        destinations: [
          NavigationDestination(
            icon: NavIconWithBadge(
              icon: Icons.chat_bubble_rounded,
              count: state.directUnreadCount,
            ),
            label: 'Chats',
          ),
          NavigationDestination(
            icon: NavIconWithBadge(
              icon: Icons.tag_rounded,
              count: state.serverUnreadCount,
            ),
            label: 'Channels',
          ),
          const NavigationDestination(
            icon: Icon(Icons.call_rounded),
            label: 'Calls',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: state.stories.any((story) => !story.viewed),
              child: const Icon(Icons.auto_stories_rounded),
            ),
            label: 'Stories',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_rounded),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}

class NavIconWithBadge extends StatelessWidget {
  const NavIconWithBadge({required this.icon, required this.count, super.key});

  final IconData icon;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Badge(
      isLabelVisible: count > 0,
      label: Text(count > 99 ? '99+' : '$count'),
      child: Icon(icon),
    );
  }
}

class ServerRail extends StatelessWidget {
  const ServerRail({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    return Panel(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      color: WebCordColors.rail,
      radius: 0,
      blur: false,
      child: SizedBox(
        width: 66,
        child: Column(
          children: [
            const BrandMark(size: 34),
            const SizedBox(height: 16),
            RailButton(
              selected: state.workspace == WorkspaceKind.server,
              icon: Icons.tag_rounded,
              label: 'Channels',
              onTap: () => state.selectWorkspace(WorkspaceKind.server),
            ),
            RailButton(
              selected: state.workspace == WorkspaceKind.friends,
              icon: Icons.people_alt_rounded,
              label: 'Friends',
              onTap: () => state.selectWorkspace(WorkspaceKind.friends),
            ),
            RailButton(
              selected: state.workspace == WorkspaceKind.direct,
              icon: Icons.alternate_email_rounded,
              label: 'Directs',
              onTap: () => state.selectWorkspace(WorkspaceKind.direct),
            ),
            RailButton(
              selected: state.workspace == WorkspaceKind.calls,
              icon: Icons.call_rounded,
              label: 'Calls',
              onTap: () => state.selectWorkspace(WorkspaceKind.calls),
            ),
            RailButton(
              selected: state.workspace == WorkspaceKind.stories,
              icon: Icons.auto_stories_rounded,
              label: 'Stories',
              onTap: () => state.selectWorkspace(WorkspaceKind.stories),
            ),
            const Spacer(),
            InkWell(
              borderRadius: BorderRadius.circular(999),
              onTap: () => state.selectWorkspace(WorkspaceKind.profile),
              child: Tooltip(
                message: state.user?.displayLabel ?? 'Profile',
                child: UserAvatar(user: state.user, size: 40),
              ),
            ),
            const SizedBox(height: 8),
            RailButton(
              selected: false,
              icon: Icons.settings_rounded,
              label: 'Settings',
              onTap: () => showSettingsDialog(context, state),
            ),
            RailButton(
              selected: false,
              icon: Icons.logout_rounded,
              label: 'Logout',
              onTap: state.logout,
            ),
          ],
        ),
      ),
    );
  }
}

class RailButton extends StatelessWidget {
  const RailButton({
    required this.selected,
    required this.icon,
    required this.label,
    required this.onTap,
    super.key,
  });

  final bool selected;
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Tooltip(
        message: label,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: AnimatedScale(
            scale: selected ? 1.06 : 1,
            duration: wcFastMotion,
            curve: wcEase,
            child: AnimatedContainer(
              duration: wcFastMotion,
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(selected ? 12 : 15),
                color: selected
                    ? palette.accent.withAlpha(48)
                    : Colors.transparent,
                border: Border.all(
                  color: selected
                      ? palette.accent.withAlpha(92)
                      : Colors.transparent,
                ),
              ),
              child: Icon(
                icon,
                size: 20,
                color: selected ? palette.text : palette.muted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class Sidebar extends StatefulWidget {
  const Sidebar({required this.state, this.compact = false, super.key});

  final WebCordState state;
  final bool compact;

  @override
  State<Sidebar> createState() => _SidebarState();
}

class _SidebarState extends State<Sidebar> {
  final _friend = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _friend.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    return Panel(
      padding: EdgeInsets.zero,
      radius: 0,
      blur: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!widget.compact)
            _TelegramSidebarHeader(state: state)
          else
            BrandHeader(state: state),
          Padding(
            padding: EdgeInsets.fromLTRB(
              widget.compact ? 0 : 14,
              12,
              widget.compact ? 0 : 14,
              6,
            ),
            child: TextField(
              onChanged: (value) => setState(() => _query = value.trim()),
              decoration: const InputDecoration(
                hintText: 'Search',
                prefixIcon: Icon(Icons.search_rounded, size: 20),
                contentPadding: EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 11,
                ),
              ),
            ),
          ),
          Expanded(
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: widget.compact ? 0 : 12,
              ),
              child: switch (state.workspace) {
                WorkspaceKind.server => _serverList(context, state),
                WorkspaceKind.friends => _friendsList(context, state),
                WorkspaceKind.direct ||
                WorkspaceKind.calls ||
                WorkspaceKind.stories ||
                WorkspaceKind.profile => _directList(state),
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _serverList(BuildContext context, WebCordState state) {
    final query = _query.toLowerCase();
    final textChannels = state.textChannels
        .where(
          (channel) =>
              query.isEmpty || channel.name.toLowerCase().contains(query),
        )
        .toList();
    final voiceChannels = state.voiceChannels
        .where(
          (channel) =>
              query.isEmpty || channel.name.toLowerCase().contains(query),
        )
        .toList();
    return ListView(
      children: [
        Row(
          children: [
            const Expanded(child: SectionLabel('Text channels')),
            if (state.canManageChannels)
              IconButton(
                tooltip: 'Create text channel',
                onPressed: () =>
                    showCreateChannelDialog(context, state, ChannelKind.text),
                icon: const Icon(Icons.add_rounded, size: 19),
              ),
          ],
        ),
        for (final channel in textChannels)
          NavRow(
            selected: channel.id == state.selectedTextChannelId,
            icon: Icons.tag_rounded,
            title: channel.name,
            trailing: state.unreadChannelIds.contains(channel.id)
                ? const UnreadDot()
                : null,
            onTap: () => state.selectTextChannel(channel.id),
          ),
        Row(
          children: [
            const Expanded(child: SectionLabel('Voice rooms')),
            if (state.canManageChannels)
              IconButton(
                tooltip: 'Create voice channel',
                onPressed: () =>
                    showCreateChannelDialog(context, state, ChannelKind.voice),
                icon: const Icon(Icons.add_rounded, size: 19),
              ),
          ],
        ),
        for (final channel in voiceChannels)
          NavRow(
            selected: channel.id == state.selectedVoiceChannelId,
            icon: Icons.graphic_eq_rounded,
            title: channel.name,
            trailing:
                channel.id == state.selectedVoiceChannelId && state.voiceJoined
                ? const Icon(
                    Icons.circle,
                    size: 9,
                    color: WebCordColors.success,
                  )
                : null,
            onTap: () => state.selectVoiceChannel(channel.id),
          ),
        if (state.social.conversations.isNotEmpty) ...[
          const SectionLabel('Personal messages'),
          for (final conversation in state.social.conversations)
            _ConversationSidebarRow(
              conversation: conversation,
              selected:
                  state.workspace == WorkspaceKind.direct &&
                  conversation.id == state.selectedConversationId,
              unread: state.unreadConversationIds.contains(conversation.id),
              onTap: () => state.selectConversation(conversation.id),
            ),
        ],
      ],
    );
  }

  Widget _friendsList(BuildContext context, WebCordState state) {
    final incoming = state.social.requests
        .where((request) => request.isIncoming && request.isPending)
        .toList();
    return ListView(
      children: [
        const SectionLabel('Add friend'),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _friend,
                decoration: const InputDecoration(hintText: 'Username'),
                onSubmitted: (_) => _sendFriend(state),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              tooltip: 'Send request',
              onPressed: () => _sendFriend(state),
              icon: const Icon(Icons.person_add_alt_1_rounded),
            ),
          ],
        ),
        const SectionLabel('Requests'),
        if (incoming.isEmpty)
          const EmptyLine('No pending invites')
        else
          for (final request in incoming)
            FriendRequestRow(
              request: request,
              onAccept: () => state.respondFriendRequest(request, true),
              onDecline: () => state.respondFriendRequest(request, false),
            ),
        const SectionLabel('Friends'),
        if (state.social.friends.isEmpty)
          const EmptyLine('No friends yet')
        else
          for (final friend in state.social.friends)
            UserRow(
              user: friend.user,
              subtitle: 'Open direct message',
              onTap: () => state.openDirect(friend),
            ),
      ],
    );
  }

  Widget _directList(WebCordState state) {
    final query = _query.toLowerCase();
    final conversations = state.social.conversations
        .where(
          (conversation) =>
              query.isEmpty ||
              conversation.displayTitle.toLowerCase().contains(query) ||
              (conversation.lastMessage?.content.toLowerCase().contains(
                    query,
                  ) ??
                  false),
        )
        .toList();
    return ListView(
      children: [
        Row(
          children: [
            const Expanded(child: SectionLabel('Chats')),
            IconButton(
              tooltip: 'Create group',
              onPressed: () => showCreateGroupDialog(context, state),
              icon: const Icon(Icons.group_add_rounded, size: 19),
            ),
          ],
        ),
        if (conversations.isEmpty)
          const EmptyLine('Accept a friend request or create a group')
        else
          for (final conversation in conversations)
            NavRow(
              selected: conversation.id == state.selectedConversationId,
              icon: conversation.isGroup
                  ? Icons.groups_rounded
                  : Icons.alternate_email_rounded,
              title: conversation.displayTitle,
              subtitle: conversation.lastMessage?.content.isNotEmpty == true
                  ? conversation.lastMessage!.content
                  : conversation.lastMessage?.attachmentName ??
                        conversation.subtitleLabel,
              trailing: state.unreadConversationIds.contains(conversation.id)
                  ? const UnreadDot()
                  : null,
              onTap: () => state.selectConversation(conversation.id),
            ),
      ],
    );
  }

  void _sendFriend(WebCordState state) {
    final username = _friend.text.trim();
    if (username.isEmpty) return;
    state.sendFriendRequest(username);
    _friend.clear();
  }
}

class _TelegramSidebarHeader extends StatelessWidget {
  const _TelegramSidebarHeader({required this.state});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Container(
      height: 70,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: palette.bg.withAlpha(188),
        border: Border(bottom: BorderSide(color: palette.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              state.guild?.name ?? 'WebCord',
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
          ),
          IconButton(
            tooltip: 'New group',
            onPressed: () => showCreateGroupDialog(context, state),
            icon: const Icon(Icons.edit_square, size: 21),
          ),
        ],
      ),
    );
  }
}

class _ConversationSidebarRow extends StatelessWidget {
  const _ConversationSidebarRow({
    required this.conversation,
    required this.selected,
    required this.unread,
    required this.onTap,
  });

  final DirectConversation conversation;
  final bool selected;
  final bool unread;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: AnimatedContainer(
          duration: wcFastMotion,
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? palette.accent.withAlpha(52) : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              ConversationAvatar(conversation: conversation, size: 42),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conversation.displayTitle,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      conversation.lastMessage?.content ??
                          conversation.subtitleLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: palette.muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              if (unread) const UnreadDot(),
            ],
          ),
        ),
      ),
    );
  }
}

class BrandHeader extends StatelessWidget {
  const BrandHeader({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final guild = state.guild;
    final accent = _parseHexColor(guild?.accentColor ?? '', palette.accent);
    final statusColor = state.socketStatus == 'connected'
        ? WebCordColors.cyan
        : WebCordColors.muted;
    final description = guild?.description.trim() ?? '';
    final subtitle = description.isNotEmpty
        ? description
        : state.socketStatus == 'connected'
        ? 'Live'
        : state.socketStatus;

    return Container(
      constraints: const BoxConstraints(minHeight: 84),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [accent.withAlpha(155), palette.panelStrong],
        ),
        image: guild?.bannerUrl == null
            ? null
            : DecorationImage(
                image: NetworkImage(_resolveMediaUrl(guild!.bannerUrl!)),
                fit: BoxFit.cover,
                colorFilter: ColorFilter.mode(
                  Colors.black.withAlpha(96),
                  BlendMode.darken,
                ),
              ),
      ),
      child: Row(
        children: [
          if (guild?.iconUrl == null)
            const BrandMark(size: 34)
          else
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                _resolveMediaUrl(guild!.iconUrl!),
                width: 34,
                height: 34,
                fit: BoxFit.cover,
              ),
            ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  guild?.name ?? 'WebCord',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 17,
                  ),
                ),
                Text(
                  subtitle,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class MainSurface extends StatelessWidget {
  const MainSurface({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    late final Widget content;
    if (state.workspace == WorkspaceKind.friends) {
      content = FriendsHome(state: state);
    } else if (state.workspace == WorkspaceKind.calls) {
      content = CallsHome(state: state);
    } else if (state.workspace == WorkspaceKind.stories) {
      content = StoriesHome(state: state);
    } else if (state.workspace == WorkspaceKind.profile) {
      content = ProfileHome(state: state);
    } else {
      content = Panel(
        padding: EdgeInsets.zero,
        color: WebCordColors.panel.withAlpha(238),
        radius: 0,
        blur: false,
        child: Column(
          children: [
            ChatHeader(state: state),
            if (state.voiceJoined) VoiceCallBanner(state: state),
            if (state.voiceJoined) VoiceStage(state: state),
            const Divider(height: 1, color: WebCordColors.border),
            Expanded(
              child: ChatWallpaper(
                state: state,
                child: MessageList(state: state),
              ),
            ),
            Composer(state: state),
          ],
        ),
      );
    }

    return AnimatedSwitcher(
      duration: wcBaseMotion,
      switchInCurve: wcEase,
      switchOutCurve: Curves.easeInCubic,
      transitionBuilder: (child, animation) {
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(.018, .018),
              end: Offset.zero,
            ).animate(animation),
            child: child,
          ),
        );
      },
      child: KeyedSubtree(key: ValueKey(state.workspace), child: content),
    );
  }
}

class ChatHeader extends StatelessWidget {
  const ChatHeader({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final mobile = MediaQuery.sizeOf(context).width < 980;
    if (mobile) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      child: Row(
        children: [
          Icon(
            state.workspace == WorkspaceKind.direct
                ? Icons.alternate_email_rounded
                : Icons.tag_rounded,
            color: WebCordColors.cyan,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  state.title,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  state.subtitle,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: WebCordColors.muted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          LivePill(status: state.socketStatus),
          if (state.workspace == WorkspaceKind.server ||
              state.workspace == WorkspaceKind.direct) ...[
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: 'Set chat wallpaper',
              onPressed: state.setCurrentChatWallpaper,
              icon: const Icon(Icons.wallpaper_rounded),
            ),
          ],
          if (state.workspace == WorkspaceKind.direct &&
              state.activeConversation != null) ...[
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: 'Audio call',
              onPressed: state.busy || state.mediaBusy
                  ? null
                  : () => state.startDirectCall(state.activeConversation!),
              icon: const Icon(Icons.call_rounded),
            ),
            const SizedBox(width: 6),
            IconButton.filledTonal(
              tooltip: 'Video call',
              onPressed: state.busy || state.mediaBusy
                  ? null
                  : () => state.startDirectCall(
                      state.activeConversation!,
                      video: true,
                    ),
              icon: const Icon(Icons.videocam_rounded),
            ),
          ],
          if (mobile && state.workspace == WorkspaceKind.server) ...[
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: state.voiceJoined ? 'Leave voice' : 'Join voice',
              onPressed:
                  state.mediaBusy ||
                      state.selectedVoiceChannelId == null ||
                      (state.socketStatus != 'connected' && !state.voiceJoined)
                  ? null
                  : state.joinOrLeaveVoice,
              icon: state.mediaBusy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(
                      state.voiceJoined
                          ? Icons.call_end_rounded
                          : Icons.call_rounded,
                    ),
            ),
          ],
        ],
      ),
    );
  }
}

class VoiceCallBanner extends StatelessWidget {
  const VoiceCallBanner({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 620;
        final title = Row(
          children: [
            const Icon(Icons.graphic_eq_rounded, color: WebCordColors.success),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    state.activeVoiceTitle,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  Text(
                    state.voiceStatus,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: palette.muted, fontSize: 12),
                  ),
                  const SizedBox(height: 5),
                  VoiceQualityPill(stats: state.voiceQuality),
                ],
              ),
            ),
          ],
        );
        final controls = Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            VoiceControlStrip(state: state),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: 'Open call',
              onPressed: () => showVoiceCallScreen(context, state),
              icon: const Icon(Icons.open_in_full_rounded),
            ),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: 'Leave voice',
              onPressed: state.joinOrLeaveVoice,
              icon: const Icon(Icons.call_end_rounded),
            ),
          ],
        );

        return DecoratedBox(
          decoration: BoxDecoration(
            color: palette.panelSoft.withAlpha(220),
            border: Border(
              top: BorderSide(color: palette.border),
              bottom: BorderSide(color: palette.border),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: compact
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [title, const SizedBox(height: 10), controls],
                  )
                : Row(
                    children: [
                      Expanded(child: title),
                      controls,
                    ],
                  ),
          ),
        );
      },
    );
  }
}

class VoiceStage extends StatelessWidget {
  const VoiceStage({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final feeds = state.voiceVideoFeeds;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: palette.bgAlt.withAlpha(210),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: palette.border),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: feeds.isEmpty
              ? Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        color: palette.cyan.withAlpha(26),
                        border: Border.all(color: palette.cyan.withAlpha(100)),
                      ),
                      child: Icon(
                        Icons.spatial_audio_off_rounded,
                        color: palette.cyan,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Audio room',
                            style: TextStyle(fontWeight: FontWeight.w900),
                          ),
                          Text(
                            '${state.voiceParticipants.length} participant(s), camera and screen are off',
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: palette.muted),
                          ),
                        ],
                      ),
                    ),
                  ],
                )
              : LayoutBuilder(
                  builder: (context, constraints) {
                    final columns = constraints.maxWidth > 820
                        ? 3
                        : constraints.maxWidth > 520
                        ? 2
                        : 1;
                    return GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: columns,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        childAspectRatio: 16 / 9,
                      ),
                      itemCount: feeds.length,
                      itemBuilder: (context, index) {
                        return VoiceVideoTile(feed: feeds[index]);
                      },
                    );
                  },
                ),
        ),
      ),
    );
  }
}

class VoiceVideoTile extends StatelessWidget {
  const VoiceVideoTile({required this.feed, super.key});

  final VoiceVideoFeed feed;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: feed.speaking
              ? WebCordColors.success.withAlpha(190)
              : palette.border,
          width: feed.speaking ? 2 : 1,
        ),
        boxShadow: feed.speaking
            ? [
                BoxShadow(
                  color: WebCordColors.success.withAlpha(42),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                ),
              ]
            : const [],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(7),
        child: Stack(
          fit: StackFit.expand,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [palette.panelStrong, palette.panelSoft],
                ),
              ),
              child: RTCVideoView(
                feed.renderer,
                objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                mirror: feed.local && !feed.screen,
              ),
            ),
            Positioned(
              left: 8,
              right: 8,
              bottom: 8,
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withAlpha(150),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.white.withAlpha(30)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          feed.screen
                              ? Icons.screen_share_rounded
                              : feed.speaking
                              ? Icons.graphic_eq_rounded
                              : Icons.videocam_rounded,
                          size: 14,
                          color: feed.speaking
                              ? WebCordColors.success
                              : palette.cyan,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          feed.label,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class VoiceMiniPanel extends StatelessWidget {
  const VoiceMiniPanel({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Align(
      alignment: Alignment.bottomRight,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: palette.panel.withAlpha(238),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: state.voiceQuality.speaking
                  ? WebCordColors.success.withAlpha(130)
                  : palette.border,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withAlpha(102),
                blurRadius: 24,
                offset: Offset(0, 12),
              ),
              if (state.voiceQuality.speaking)
                BoxShadow(
                  color: WebCordColors.success.withAlpha(38),
                  blurRadius: 24,
                  offset: const Offset(0, 8),
                ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  state.voiceQuality.speaking
                      ? Icons.graphic_eq_rounded
                      : Icons.call_rounded,
                  color: state.voiceQuality.speaking
                      ? WebCordColors.success
                      : palette.cyan,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        state.activeVoiceTitle,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      VoiceQualityPill(
                        stats: state.voiceQuality,
                        compact: true,
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Open call',
                  onPressed: () => showVoiceCallScreen(context, state),
                  icon: const Icon(Icons.open_in_full_rounded),
                ),
                IconButton(
                  tooltip: 'Leave voice',
                  onPressed: state.joinOrLeaveVoice,
                  icon: const Icon(Icons.call_end_rounded),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class IncomingCallBanner extends StatelessWidget {
  const IncomingCallBanner({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final call = state.incomingCall;
    if (call == null) return const SizedBox.shrink();
    final palette = WebCordPalette.of(context);
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: palette.panel.withAlpha(246),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: palette.cyan.withAlpha(150)),
            boxShadow: [
              BoxShadow(
                color: palette.cyan.withAlpha(34),
                blurRadius: 28,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: WebCordColors.success.withAlpha(30),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: WebCordColors.success.withAlpha(120),
                    ),
                  ),
                  child: Icon(
                    call.video ? Icons.videocam_rounded : Icons.call_rounded,
                    color: WebCordColors.success,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        call.title,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        call.video ? 'Incoming video call' : 'Incoming call',
                        style: TextStyle(color: palette.muted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                IconButton.filledTonal(
                  tooltip: 'Decline',
                  onPressed: state.declineIncomingCall,
                  icon: const Icon(Icons.call_end_rounded),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  tooltip: 'Accept',
                  onPressed: state.acceptIncomingCall,
                  icon: const Icon(Icons.call_rounded),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> showVoiceCallScreen(BuildContext context, WebCordState state) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (context) => AnimatedBuilder(
        animation: state,
        builder: (context, _) => VoiceCallScreen(state: state),
      ),
    ),
  );
}

class VoiceCallScreen extends StatelessWidget {
  const VoiceCallScreen({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final feeds = state.voiceVideoFeeds;
    return Material(
      type: MaterialType.transparency,
      child: AppBackdrop(
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                Row(
                  children: [
                    Icon(Icons.call_rounded, color: palette.cyan),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            state.activeVoiceTitle,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                          Text(
                            state.voiceStatus,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: palette.muted),
                          ),
                        ],
                      ),
                    ),
                    VoiceQualityPill(stats: state.voiceQuality),
                    const SizedBox(width: 8),
                    IconButton.filledTonal(
                      tooltip: 'Close',
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Expanded(
                  child: feeds.isEmpty
                      ? _VoiceAudioStage(state: state)
                      : LayoutBuilder(
                          builder: (context, constraints) {
                            final columns = constraints.maxWidth > 980
                                ? 3
                                : constraints.maxWidth > 620
                                ? 2
                                : 1;
                            return GridView.builder(
                              gridDelegate:
                                  SliverGridDelegateWithFixedCrossAxisCount(
                                    crossAxisCount: columns,
                                    crossAxisSpacing: 12,
                                    mainAxisSpacing: 12,
                                    childAspectRatio: 16 / 9,
                                  ),
                              itemCount: feeds.length,
                              itemBuilder: (context, index) =>
                                  VoiceVideoTile(feed: feeds[index]),
                            );
                          },
                        ),
                ),
                const SizedBox(height: 12),
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: palette.panel.withAlpha(238),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: palette.border),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    child: Row(
                      children: [
                        Expanded(child: VoiceControlStrip(state: state)),
                        FilledButton.icon(
                          onPressed: state.joinOrLeaveVoice,
                          icon: const Icon(Icons.call_end_rounded),
                          label: const Text('Leave'),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _VoiceAudioStage extends StatelessWidget {
  const _VoiceAudioStage({required this.state});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: palette.panel.withAlpha(230),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: palette.border),
          ),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.spatial_audio_rounded,
                  size: 46,
                  color: palette.cyan,
                ),
                const SizedBox(height: 12),
                Text(
                  'Audio room',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 6),
                Text(
                  '${state.voiceParticipants.length} participant(s)',
                  style: TextStyle(color: palette.muted),
                ),
                const SizedBox(height: 18),
                if (state.voiceParticipants.isEmpty)
                  const EmptyLine('Waiting for others')
                else
                  for (final participant in state.voiceParticipants)
                    VoiceParticipantPresence(
                      participant: participant,
                      onTap: () => showVoiceParticipantSheet(
                        context,
                        state,
                        participant,
                      ),
                    ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class MessageList extends StatelessWidget {
  const MessageList({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    if (!state.canSend) {
      return const EmptyState(
        icon: Icons.forum_rounded,
        title: 'Choose a conversation',
        body: 'Pick a channel or direct message to start talking.',
      );
    }
    if (state.messages.isEmpty) {
      return const EmptyState(
        icon: Icons.auto_awesome_rounded,
        title: 'No messages yet',
        body: 'Start the conversation in this room.',
      );
    }
    final extraTopItems = state.hasOlderMessages ? 1 : 0;
    return ListView.builder(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      physics: const BouncingScrollPhysics(
        parent: AlwaysScrollableScrollPhysics(),
      ),
      padding: EdgeInsets.fromLTRB(18, state.compactMessages ? 10 : 14, 18, 18),
      itemCount: state.messages.length + extraTopItems,
      itemBuilder: (context, index) {
        if (state.hasOlderMessages && index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Center(
              child: OutlinedButton.icon(
                onPressed: state.loadingOlderMessages
                    ? null
                    : state.loadOlderMessages,
                icon: state.loadingOlderMessages
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.history_rounded),
                label: Text(
                  state.loadingOlderMessages
                      ? 'Loading history'
                      : 'Load older messages',
                ),
              ),
            ),
          );
        }
        final message = state.messages[index - extraTopItems];
        return MessageTile(
          message: message,
          own: message.author.id == state.user?.id,
          state: state,
        );
      },
    );
  }
}

class ChatWallpaper extends StatelessWidget {
  const ChatWallpaper({required this.state, required this.child, super.key});

  final WebCordState state;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final path = state.chatWallpaperPath.trim();
    final wallpaper = path.isEmpty ? null : File(path);
    final hasWallpaper = wallpaper != null && wallpaper.existsSync();
    final dimAlpha = ((state.chatWallpaperDim / 100) * 255).round();

    return AnimatedContainer(
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        color: palette.bgAlt.withAlpha(230),
        image: hasWallpaper
            ? DecorationImage(
                image: FileImage(wallpaper),
                fit: BoxFit.cover,
                colorFilter: ColorFilter.mode(
                  Colors.black.withAlpha(dimAlpha),
                  BlendMode.darken,
                ),
              )
            : null,
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    palette.bg.withAlpha(hasWallpaper ? 70 : 28),
                    Colors.transparent,
                    palette.bg.withAlpha(hasWallpaper ? 126 : 48),
                  ],
                ),
              ),
            ),
          ),
          child,
        ],
      ),
    );
  }
}

class MessageTile extends StatelessWidget {
  const MessageTile({
    required this.message,
    required this.own,
    required this.state,
    super.key,
  });

  final ChatMessage message;
  final bool own;
  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final compact = state.compactMessages;
    final palette = WebCordPalette.of(context);
    final screenWidth = MediaQuery.sizeOf(context).width;
    final mobile = screenWidth < 640;
    final maxBubbleWidth = mobile ? screenWidth * .86 : 620.0;
    final bubbleColor = own
        ? Color.alphaBlend(palette.accent.withAlpha(138), palette.panelStrong)
        : mobile
        ? Colors.transparent
        : palette.panelSoft.withAlpha(242);
    final bubbleBorder = own
        ? palette.accent.withAlpha(105)
        : mobile
        ? Colors.transparent
        : palette.border.withAlpha(170);
    final radius = BorderRadius.only(
      topLeft: Radius.circular(own ? 18 : 6),
      topRight: Radius.circular(own ? 6 : 18),
      bottomLeft: const Radius.circular(18),
      bottomRight: const Radius.circular(18),
    );

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: wcBaseMotion,
      curve: wcEase,
      builder: (context, value, child) {
        return Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, (1 - value) * 8),
            child: child,
          ),
        );
      },
      child: Padding(
        padding: EdgeInsets.only(bottom: compact ? 6 : 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisAlignment: own
              ? MainAxisAlignment.end
              : MainAxisAlignment.start,
          children: [
            if (!own) UserAvatar(user: message.author, size: mobile ? 42 : 34),
            if (!own) SizedBox(width: mobile ? 12 : 8),
            Flexible(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: maxBubbleWidth),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: bubbleColor,
                    borderRadius: radius,
                    border: Border.all(color: bubbleBorder),
                    boxShadow: !own && mobile
                        ? const []
                        : [
                            BoxShadow(
                              color: Colors.black.withAlpha(32),
                              blurRadius: 14,
                              offset: const Offset(0, 7),
                            ),
                          ],
                  ),
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(
                      !own && mobile ? 0 : (compact ? 10 : 13),
                      compact ? 8 : 11,
                      !own && mobile ? 0 : (compact ? 8 : 10),
                      compact ? 9 : 12,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (!own)
                              Flexible(
                                child: Text(
                                  message.author.displayLabel,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: palette.cyan,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            if (!own) const SizedBox(width: 8),
                            Text(
                              _timeLabel(message.createdAt),
                              style: TextStyle(
                                color: own
                                    ? Colors.white.withAlpha(205)
                                    : palette.muted,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (message.editedAt != null)
                              Text(
                                ' edited',
                                style: TextStyle(
                                  color: own
                                      ? Colors.white.withAlpha(185)
                                      : palette.muted,
                                  fontSize: 11,
                                ),
                              ),
                            if (!message.isDeleted)
                              PopupMenuButton<String>(
                                tooltip: 'Message actions',
                                padding: EdgeInsets.zero,
                                icon: Icon(
                                  Icons.more_horiz_rounded,
                                  size: 18,
                                  color: own
                                      ? Colors.white.withAlpha(220)
                                      : palette.muted,
                                ),
                                color: palette.panelStrong,
                                onSelected: (value) {
                                  if (value == 'edit') {
                                    showEditMessageDialog(
                                      context,
                                      state,
                                      message,
                                    );
                                  } else if (value == 'delete') {
                                    state.deleteMessage(message);
                                  } else if (value == 'report') {
                                    state.reportMessage(message);
                                  }
                                },
                                itemBuilder: (context) => [
                                  if (own)
                                    const PopupMenuItem(
                                      value: 'edit',
                                      child: Text('Edit'),
                                    ),
                                  if (own)
                                    const PopupMenuItem(
                                      value: 'delete',
                                      child: Text('Delete'),
                                    ),
                                  if (!own)
                                    const PopupMenuItem(
                                      value: 'report',
                                      child: Text('Report'),
                                    ),
                                ],
                              ),
                          ],
                        ),
                        if (message.replyTo != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 7),
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: Colors.black.withAlpha(38),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(9, 7, 10, 7),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                      width: 3,
                                      height: 18,
                                      decoration: BoxDecoration(
                                        color: own
                                            ? palette.cyan
                                            : palette.accent,
                                        borderRadius: BorderRadius.circular(99),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Flexible(
                                      child: Text(
                                        'Reply to ${message.replyTo!.author.displayLabel}: ${message.replyTo!.content}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          color: own
                                              ? Colors.white.withAlpha(220)
                                              : palette.muted,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        if (message.isDeleted)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(
                              'Message deleted',
                              style: TextStyle(color: palette.muted),
                            ),
                          )
                        else if (message.content.isNotEmpty)
                          Padding(
                            padding: EdgeInsets.only(top: own ? 5 : 6),
                            child: Text(
                              message.content,
                              style: const TextStyle(height: 1.34),
                            ),
                          ),
                        if (!message.isDeleted && message.hasAttachment)
                          Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: AttachmentChip(
                              message: message,
                              state: state,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            if (own) const SizedBox(width: 42),
          ],
        ),
      ),
    );
  }
}

class Composer extends StatefulWidget {
  const Composer({required this.state, super.key});

  final WebCordState state;

  @override
  State<Composer> createState() => _ComposerState();
}

class _ComposerState extends State<Composer> {
  final _controller = TextEditingController();
  bool _hasText = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_syncTextState);
  }

  @override
  void dispose() {
    _controller.removeListener(_syncTextState);
    _controller.dispose();
    super.dispose();
  }

  void _syncTextState() {
    final next = _controller.text.trim().isNotEmpty;
    if (next != _hasText) setState(() => _hasText = next);
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final palette = WebCordPalette.of(context);
    final canSendPayload = _hasText || state.pendingAttachment != null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
      child: Column(
        children: [
          AnimatedSwitcher(
            duration: wcBaseMotion,
            switchInCurve: wcEase,
            switchOutCurve: Curves.easeInCubic,
            child: state.recordingVoice
                ? Padding(
                    key: const ValueKey('recording'),
                    padding: const EdgeInsets.only(bottom: 8),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: WebCordColors.danger.withAlpha(34),
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                          color: WebCordColors.danger.withAlpha(120),
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.fiber_manual_record_rounded,
                              color: WebCordColors.danger,
                              size: 18,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Recording voice ${_durationLabel(state.voiceRecordingElapsed)}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            IconButton(
                              tooltip: 'Cancel voice',
                              onPressed: state.mediaBusy
                                  ? null
                                  : () => state.stopVoiceMessage(send: false),
                              icon: const Icon(Icons.close_rounded),
                            ),
                            FilledButton.icon(
                              onPressed: state.mediaBusy
                                  ? null
                                  : () => state.stopVoiceMessage(),
                              icon: const Icon(Icons.send_rounded, size: 18),
                              label: const Text('Send'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  )
                : state.pendingAttachment != null
                ? Padding(
                    key: const ValueKey('attachment'),
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: palette.panelStrong,
                              borderRadius: BorderRadius.circular(18),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              child: Text(
                                state.pendingAttachment!.name,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Remove attachment',
                          onPressed: state.clearAttachment,
                          icon: const Icon(Icons.close_rounded),
                        ),
                      ],
                    ),
                  )
                : const SizedBox.shrink(key: ValueKey('empty')),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              color: palette.bgAlt.withAlpha(236),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: palette.border),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withAlpha(44),
                  blurRadius: 16,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 5),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Attach file',
                    onPressed: state.uploading || !state.canSend
                        ? null
                        : state.pickAttachment,
                    icon: state.uploading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.attach_file_rounded),
                  ),
                  IconButton(
                    tooltip: state.recordingVoice
                        ? 'Send voice message'
                        : 'Record voice message',
                    onPressed: !state.recordingVoice && !state.canRecordMedia
                        ? null
                        : state.recordingVoice
                        ? () => state.stopVoiceMessage()
                        : state.startVoiceMessage,
                    icon: state.mediaBusy && !state.recordingVoice
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(
                            state.recordingVoice
                                ? Icons.stop_circle_rounded
                                : Icons.mic_rounded,
                          ),
                  ),
                  IconButton(
                    tooltip: 'Record video circle',
                    onPressed: state.canRecordMedia && !state.recordingVoice
                        ? () => showCircleRecorder(context, state)
                        : null,
                    icon: const Icon(Icons.video_camera_front_rounded),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      enabled: state.canSend,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        filled: false,
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 10,
                        ),
                        hintText: state.workspace == WorkspaceKind.direct
                            ? 'Message your friend'
                            : 'Message #${state.activeTextChannel?.name ?? 'lobby'}',
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  AnimatedContainer(
                    duration: wcFastMotion,
                    curve: wcEase,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: canSendPayload && state.canSend
                          ? palette.accent
                          : palette.panelStrong,
                    ),
                    child: IconButton(
                      tooltip: 'Send',
                      onPressed: state.busy || !state.canSend || !canSendPayload
                          ? null
                          : _send,
                      icon: const Icon(Icons.send_rounded),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _send() {
    final text = _controller.text;
    if (text.trim().isEmpty && widget.state.pendingAttachment == null) return;
    widget.state.sendMessage(text);
    _controller.clear();
  }
}

class FriendsHome extends StatelessWidget {
  const FriendsHome({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    return Panel(
      child: ListView(
        children: [
          Row(
            children: [
              const Icon(Icons.people_alt_rounded, color: WebCordColors.cyan),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Friends',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
              ),
              OutlinedButton.icon(
                onPressed: state.refreshSocial,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Refresh'),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              StatTile(
                label: 'Friends',
                value: '${state.social.friends.length}',
              ),
              StatTile(
                label: 'Requests',
                value:
                    '${state.social.requests.where((item) => item.isPending).length}',
              ),
              StatTile(
                label: 'Directs',
                value: '${state.social.conversations.length}',
              ),
            ],
          ),
          const SectionLabel('People'),
          if (state.social.friends.isEmpty)
            const EmptyState(
              icon: Icons.person_add_alt_1_rounded,
              title: 'Your friend list is empty',
              body: 'Send a friend request from the sidebar.',
            )
          else
            for (final friend in state.social.friends)
              UserRow(
                user: friend.user,
                subtitle: 'Tap to open direct message',
                onTap: () => state.openDirect(friend),
              ),
        ],
      ),
    );
  }
}

class CallsHome extends StatelessWidget {
  const CallsHome({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Panel(
      child: ListView(
        children: [
          Row(
            children: [
              const Icon(Icons.call_rounded, color: WebCordColors.cyan),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Calls',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
              ),
              if (state.voiceJoined)
                FilledButton.icon(
                  onPressed: () => showVoiceCallScreen(context, state),
                  icon: const Icon(Icons.open_in_full_rounded),
                  label: const Text('Open'),
                ),
            ],
          ),
          const SizedBox(height: 14),
          if (state.activeCall != null)
            DecoratedBox(
              decoration: BoxDecoration(
                color: palette.cyan.withAlpha(22),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: palette.cyan.withAlpha(130)),
              ),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    const Icon(
                      Icons.graphic_eq_rounded,
                      color: WebCordColors.success,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            state.activeCall!.title,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          VoiceQualityPill(stats: state.voiceQuality),
                        ],
                      ),
                    ),
                    IconButton.filledTonal(
                      tooltip: 'End call',
                      onPressed: state.endActiveCall,
                      icon: const Icon(Icons.call_end_rounded),
                    ),
                  ],
                ),
              ),
            ),
          const SectionLabel('Start a call'),
          if (state.social.conversations.isEmpty)
            const EmptyState(
              icon: Icons.chat_bubble_outline_rounded,
              title: 'No chats yet',
              body: 'Open a direct message or create a group first.',
            )
          else
            for (final conversation in state.social.conversations)
              CallConversationRow(state: state, conversation: conversation),
        ],
      ),
    );
  }
}

class CallConversationRow extends StatelessWidget {
  const CallConversationRow({
    required this.state,
    required this.conversation,
    super.key,
  });

  final WebCordState state;
  final DirectConversation conversation;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: WebCordColors.panelSoft,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: WebCordColors.border),
        ),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              ConversationAvatar(conversation: conversation, size: 38),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conversation.displayTitle,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    Text(
                      conversation.subtitleLabel,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: WebCordColors.muted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton.filledTonal(
                tooltip: 'Audio call',
                onPressed: state.busy || state.mediaBusy
                    ? null
                    : () => state.startDirectCall(conversation),
                icon: const Icon(Icons.call_rounded),
              ),
              const SizedBox(width: 6),
              IconButton.filledTonal(
                tooltip: 'Video call',
                onPressed: state.busy || state.mediaBusy
                    ? null
                    : () => state.startDirectCall(conversation, video: true),
                icon: const Icon(Icons.videocam_rounded),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class StoriesHome extends StatelessWidget {
  const StoriesHome({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    return Panel(
      child: ListView(
        children: [
          Row(
            children: [
              const Icon(Icons.auto_stories_rounded, color: WebCordColors.cyan),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Stories',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
              ),
              OutlinedButton.icon(
                onPressed: state.refreshStories,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Refresh'),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                onPressed: state.uploading
                    ? null
                    : () => showStoryComposer(context, state),
                icon: state.uploading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.add_photo_alternate_rounded),
                label: const Text('Add'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (state.stories.isEmpty)
            const EmptyState(
              icon: Icons.auto_stories_outlined,
              title: 'No stories yet',
              body: 'Share a photo or video with music and a short caption.',
            )
          else
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final story in state.stories)
                  StoryCard(
                    story: story,
                    state: state,
                    onTap: () => showStoryViewer(context, state, story),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

Future<void> showStoryComposer(BuildContext context, WebCordState state) async {
  final caption = TextEditingController();
  final musicTitle = TextEditingController();
  final musicArtist = TextEditingController();
  var attachMusic = false;

  try {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        final palette = WebCordPalette.of(dialogContext);
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return Dialog(
              backgroundColor: Colors.transparent,
              insetPadding: const EdgeInsets.all(18),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: Panel(
                  padding: const EdgeInsets.all(18),
                  color: palette.panel,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.auto_stories_rounded, color: palette.cyan),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'New story',
                              style: Theme.of(context).textTheme.headlineMedium,
                            ),
                          ),
                          IconButton(
                            tooltip: 'Close',
                            onPressed: () => Navigator.pop(dialogContext),
                            icon: const Icon(Icons.close_rounded),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: caption,
                        maxLength: 180,
                        minLines: 2,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          labelText: 'Description',
                          hintText: 'What is happening?',
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: musicTitle,
                        maxLength: 96,
                        decoration: const InputDecoration(
                          labelText: 'Music title',
                          prefixIcon: Icon(Icons.music_note_rounded),
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: musicArtist,
                        maxLength: 96,
                        decoration: const InputDecoration(
                          labelText: 'Artist',
                          prefixIcon: Icon(Icons.person_rounded),
                        ),
                      ),
                      SwitchListTile(
                        value: attachMusic,
                        contentPadding: EdgeInsets.zero,
                        onChanged: (value) =>
                            setDialogState(() => attachMusic = value),
                        secondary: const Icon(Icons.audio_file_rounded),
                        title: const Text('Attach audio file'),
                        subtitle: const Text(
                          'After choosing story media, select the track file.',
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => Navigator.pop(dialogContext),
                              child: const Text('Cancel'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: () async {
                                Navigator.pop(dialogContext);
                                await state.createStoryFromFile(
                                  caption: caption.text,
                                  musicTitle: musicTitle.text,
                                  musicArtist: musicArtist.text,
                                  attachMusic: attachMusic,
                                );
                              },
                              icon: const Icon(Icons.upload_rounded),
                              label: const Text('Choose media'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  } finally {
    caption.dispose();
    musicTitle.dispose();
    musicArtist.dispose();
  }
}

class StoryCard extends StatelessWidget {
  const StoryCard({
    required this.story,
    required this.state,
    required this.onTap,
    super.key,
  });

  final StoryItem story;
  final WebCordState state;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final url = state.api.attachmentUri(story.mediaUrl).toString();
    return SizedBox(
      width: 136,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: palette.panelSoft,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: story.viewed ? palette.border : palette.cyan,
              width: story.viewed ? 1 : 2,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(18),
                ),
                child: SizedBox(
                  height: 178,
                  width: double.infinity,
                  child: story.isVideo
                      ? DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [palette.panelStrong, palette.accent],
                            ),
                          ),
                          child: const Center(
                            child: Icon(Icons.play_arrow_rounded, size: 42),
                          ),
                        )
                      : Image.network(
                          url,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const Center(
                            child: Icon(Icons.broken_image_rounded),
                          ),
                        ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(9),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        UserAvatar(user: story.author, size: 26),
                        const SizedBox(width: 7),
                        Expanded(
                          child: Text(
                            story.author.displayLabel,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (story.caption.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        story.caption,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: palette.muted, fontSize: 11),
                      ),
                    ],
                    if (story.hasMusic) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(
                            Icons.music_note_rounded,
                            size: 14,
                            color: palette.cyan,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              story.musicLabel.isEmpty
                                  ? 'Story music'
                                  : story.musicLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> showStoryViewer(
  BuildContext context,
  WebCordState state,
  StoryItem story,
) async {
  await state.markStoryViewed(story);
  final message = ChatMessage(
    id: story.id,
    content: story.caption,
    author: story.author,
    createdAt: story.createdAt,
    attachmentUrl: story.mediaUrl,
    attachmentType: story.isVideo ? 'VIDEO' : 'IMAGE',
    attachmentName: story.caption.isEmpty ? 'Story' : story.caption,
  );
  if (!context.mounted) return;
  await showMediaViewer(context, message, state, story: story);
}

class ProfileHome extends StatelessWidget {
  const ProfileHome({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final user = state.user;
    return Panel(
      child: ListView(
        children: [
          Row(
            children: [
              const Icon(Icons.person_rounded, color: WebCordColors.cyan),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Profile',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (user != null)
            UserProfileSummary(user: user, state: state, expanded: true),
          const SectionLabel('Edit profile'),
          _ProfileSettingsPanel(state: state),
          const SectionLabel('Friends'),
          if (state.social.friends.isEmpty)
            const EmptyLine('No friends yet')
          else
            for (final friend in state.social.friends.take(8))
              UserRow(
                user: friend.user,
                subtitle: 'Open direct message',
                onTap: () => state.openDirect(friend),
              ),
        ],
      ),
    );
  }
}

class RightPanel extends StatelessWidget {
  const RightPanel({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    return Panel(
      child: ListView(
        children: [
          Row(
            children: [
              UserAvatar(user: state.user, size: 48),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      state.user?.displayLabel ?? 'WebCord user',
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    Text(
                      state.user?.statusText.trim().isEmpty ?? true
                          ? 'Native client'
                          : state.user!.statusText.trim(),
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: WebCordColors.muted,
                        fontSize: 12,
                      ),
                    ),
                    if ((state.user?.favoriteTrack.trim().isNotEmpty ?? false))
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          state.user!.favoriteTrack,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: WebCordColors.cyan,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SectionLabel('Voice lounge'),
          DecoratedBox(
            decoration: BoxDecoration(
              color: WebCordColors.panelSoft,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: WebCordColors.border),
            ),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    state.voiceJoined
                        ? state.activeVoiceTitle
                        : state.activeVoiceChannel?.name ?? 'No voice channel',
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    state.voiceStatus,
                    style: const TextStyle(
                      color: WebCordColors.muted,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: state.socketStatus == 'connected'
                          ? state.joinOrLeaveVoice
                          : null,
                      icon: Icon(
                        state.voiceJoined
                            ? Icons.call_end_rounded
                            : Icons.graphic_eq_rounded,
                      ),
                      label: Text(
                        state.voiceJoined ? 'Leave voice' : 'Join voice',
                      ),
                    ),
                  ),
                  if (state.voiceJoined) ...[
                    const SizedBox(height: 10),
                    VoiceControlStrip(state: state),
                  ],
                  const SizedBox(height: 10),
                  for (final participant in state.voiceParticipants)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: VoiceParticipantPresence(
                        participant: participant,
                        dense: true,
                        onTap: () => showVoiceParticipantSheet(
                          context,
                          state,
                          participant,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SectionLabel('Activity'),
          for (final friend in state.social.friends.take(6))
            UserRow(
              user: friend.user,
              subtitle: 'Open direct message',
              onTap: () => state.openDirect(friend),
            ),
        ],
      ),
    );
  }
}

class VoiceControlStrip extends StatelessWidget {
  const VoiceControlStrip({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        VoiceActionButton(
          active: !state.micMuted,
          danger: state.micMuted,
          icon: state.micMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
          label: state.micMuted ? 'Unmute mic' : 'Mute mic',
          onTap: state.toggleMicrophone,
        ),
        VoiceActionButton(
          active: state.cameraEnabled,
          icon: state.cameraEnabled
              ? Icons.videocam_rounded
              : Icons.videocam_off_rounded,
          label: state.cameraEnabled ? 'Camera off' : 'Camera on',
          onTap: state.toggleCamera,
        ),
        VoiceActionButton(
          active: state.screenSharing,
          icon: state.screenSharing
              ? Icons.stop_screen_share_rounded
              : Icons.screen_share_rounded,
          label: state.screenSharing ? 'Stop share' : 'Share screen',
          onTap: state.toggleScreenShare,
        ),
      ],
    );
  }
}

class VoiceActionButton extends StatelessWidget {
  const VoiceActionButton({
    required this.active,
    required this.icon,
    required this.label,
    required this.onTap,
    this.danger = false,
    super.key,
  });

  final bool active;
  final bool danger;
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final color = danger
        ? WebCordColors.danger
        : active
        ? palette.cyan
        : palette.muted;
    return Tooltip(
      message: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: color.withAlpha(active && !danger ? 38 : 24),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: color.withAlpha(120)),
          ),
          child: SizedBox(
            width: 42,
            height: 38,
            child: Icon(icon, size: 20, color: color),
          ),
        ),
      ),
    );
  }
}

class VoiceParticipantPresence extends StatelessWidget {
  const VoiceParticipantPresence({
    required this.participant,
    this.dense = false,
    this.onTap,
    super.key,
  });

  final VoiceParticipant participant;
  final bool dense;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final activeColor = participant.speaking
        ? WebCordColors.success
        : palette.muted;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          decoration: BoxDecoration(
            color: participant.speaking
                ? WebCordColors.success.withAlpha(34)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: participant.speaking
                  ? WebCordColors.success.withAlpha(150)
                  : Colors.transparent,
            ),
            boxShadow: participant.speaking
                ? [
                    BoxShadow(
                      color: WebCordColors.success.withAlpha(34),
                      blurRadius: 18,
                      offset: const Offset(0, 8),
                    ),
                  ]
                : const [],
          ),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: dense ? 2 : 8,
              vertical: dense ? 2 : 7,
            ),
            child: Row(
              children: [
                Icon(Icons.circle, size: 9, color: activeColor),
                const SizedBox(width: 8),
                Expanded(
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          participant.displayLabel,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: participant.speaking
                                ? FontWeight.w900
                                : FontWeight.w700,
                          ),
                        ),
                      ),
                      if (!dense) ...[
                        const SizedBox(width: 8),
                        _VoiceProfileBadge(participant: participant),
                      ],
                    ],
                  ),
                ),
                if (dense) ...[
                  const SizedBox(width: 6),
                  _VoiceProfileBadge(participant: participant, compact: true),
                ],
                _PresenceIcon(
                  active: !participant.muted,
                  icon: participant.muted
                      ? Icons.mic_off_rounded
                      : Icons.mic_rounded,
                ),
                _PresenceIcon(
                  active: participant.camera,
                  icon: participant.camera
                      ? Icons.videocam_rounded
                      : Icons.videocam_off_rounded,
                ),
                if (participant.screen)
                  const _PresenceIcon(
                    active: true,
                    icon: Icons.screen_share_rounded,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _VoiceProfileBadge extends StatelessWidget {
  const _VoiceProfileBadge({required this.participant, this.compact = false});

  final VoiceParticipant participant;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final color = switch (participant.audioProfile) {
      'highFidelity' => palette.cyan,
      'lowData' => WebCordColors.success,
      _ => palette.accent,
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withAlpha(24),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withAlpha(92)),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 6 : 8,
          vertical: compact ? 2 : 4,
        ),
        child: Text(
          compact
              ? participant.audioProfileLabel
              : '${participant.audioProfileLabel} ${participant.audioBitrate ~/ 1000}k',
          style: TextStyle(
            color: color,
            fontSize: compact ? 10 : 11,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}

class _PresenceIcon extends StatelessWidget {
  const _PresenceIcon({required this.active, required this.icon});

  final bool active;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(left: 6),
      child: Icon(
        icon,
        size: 15,
        color: active ? palette.cyan : palette.muted.withAlpha(160),
      ),
    );
  }
}

class MobileVoiceDock extends StatelessWidget {
  const MobileVoiceDock({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    if (state.voiceChannels.isEmpty) return const SizedBox.shrink();

    final palette = WebCordPalette.of(context);
    final selectedChannel =
        state.activeVoiceChannel ?? state.voiceChannels.first;
    final canJoin = state.socketStatus == 'connected' || state.voiceJoined;
    final participantText = state.voiceJoined
        ? '${state.voiceParticipants.length} peer(s)'
        : '${state.voiceChannels.length} room(s)';

    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.panel.withAlpha(226),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color:
                        (state.voiceJoined
                                ? WebCordColors.success
                                : palette.cyan)
                            .withAlpha(28),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color:
                          (state.voiceJoined
                                  ? WebCordColors.success
                                  : palette.cyan)
                              .withAlpha(110),
                    ),
                  ),
                  child: Icon(
                    state.voiceJoined
                        ? Icons.call_rounded
                        : Icons.graphic_eq_rounded,
                    color: state.voiceJoined
                        ? WebCordColors.success
                        : palette.cyan,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        selectedChannel.name,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      Text(
                        state.voiceJoined ? state.voiceStatus : participantText,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: palette.muted, fontSize: 12),
                      ),
                      if (state.voiceJoined) ...[
                        const SizedBox(height: 5),
                        VoiceQualityPill(stats: state.voiceQuality),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: state.mediaBusy || !canJoin
                      ? null
                      : state.joinOrLeaveVoice,
                  icon: state.mediaBusy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          state.voiceJoined
                              ? Icons.call_end_rounded
                              : Icons.call_rounded,
                        ),
                  label: Text(state.voiceJoined ? 'Leave' : 'Join'),
                ),
                if (state.voiceJoined) ...[
                  const SizedBox(width: 8),
                  IconButton.filledTonal(
                    tooltip: 'Open call',
                    onPressed: () => showVoiceCallScreen(context, state),
                    icon: const Icon(Icons.open_in_full_rounded),
                  ),
                ],
              ],
            ),
            if (state.voiceChannels.length > 1) ...[
              const SizedBox(height: 10),
              SizedBox(
                height: 38,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: state.voiceChannels.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, index) {
                    final channel = state.voiceChannels[index];
                    return ChoiceChip(
                      selected: channel.id == state.selectedVoiceChannelId,
                      avatar: const Icon(Icons.graphic_eq_rounded, size: 16),
                      label: Text(channel.name),
                      onSelected: (_) => state.selectVoiceChannel(channel.id),
                    );
                  },
                ),
              ),
            ],
            if (state.voiceJoined) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: VoiceControlStrip(state: state),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class MobileQuickSwitch extends StatelessWidget {
  const MobileQuickSwitch({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final items = state.workspace == WorkspaceKind.direct
        ? state.social.conversations
              .map(
                (conversation) => (
                  id: conversation.id,
                  label: conversation.isGroup
                      ? conversation.displayTitle
                      : '@ ${conversation.displayTitle}',
                  selected: conversation.id == state.selectedConversationId,
                ),
              )
              .toList()
        : state.textChannels
              .map(
                (channel) => (
                  id: channel.id,
                  label: '# ${channel.name}',
                  selected: channel.id == state.selectedTextChannelId,
                ),
              )
              .toList();
    return SizedBox(
      height: 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final item = items[index];
          return ChoiceChip(
            selected: item.selected,
            label: Text(item.label),
            onSelected: (_) {
              if (state.workspace == WorkspaceKind.direct) {
                state.selectConversation(item.id);
              } else {
                state.selectTextChannel(item.id);
              }
            },
          );
        },
      ),
    );
  }
}

Future<void> showMobileNavigationSheet(
  BuildContext context,
  WebCordState state,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (context) => AnimatedBuilder(
      animation: state,
      builder: (context, _) => MobileNavigationSheet(state: state),
    ),
  );
}

Future<void> showMobileVoiceSheet(BuildContext context, WebCordState state) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (context) => AnimatedBuilder(
      animation: state,
      builder: (context, _) => MobileVoiceSheet(state: state),
    ),
  );
}

class MobileNavigationSheet extends StatelessWidget {
  const MobileNavigationSheet({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return _MobileSheetFrame(
      title: state.guild?.name ?? 'WebCord',
      icon: Icons.menu_rounded,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        children: [
          const SectionLabel('Text channels'),
          if (state.textChannels.isEmpty)
            const EmptyLine('No text channels')
          else
            for (final channel in state.textChannels)
              MobileSheetRow(
                selected:
                    channel.id == state.selectedTextChannelId &&
                    state.workspace == WorkspaceKind.server,
                icon: Icons.tag_rounded,
                title: channel.name,
                subtitle: channel.id == state.selectedTextChannelId
                    ? 'Current chat'
                    : 'Open channel',
                trailing: state.unreadChannelIds.contains(channel.id)
                    ? const UnreadDot()
                    : null,
                onTap: () {
                  Navigator.pop(context);
                  unawaited(state.selectTextChannel(channel.id));
                },
              ),
          Row(
            children: [
              const Expanded(child: SectionLabel('Voice rooms')),
              if (state.canManageChannels)
                TextButton.icon(
                  onPressed: () => showCreateChannelDialog(
                    context,
                    state,
                    ChannelKind.voice,
                  ),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Create'),
                ),
            ],
          ),
          if (state.voiceChannels.isEmpty)
            const EmptyLine('No voice rooms')
          else
            for (final channel in state.voiceChannels)
              MobileVoiceRoomRow(channel: channel, state: state),
          Row(
            children: [
              const Expanded(child: SectionLabel('Chats')),
              TextButton.icon(
                onPressed: () => showCreateGroupDialog(context, state),
                icon: const Icon(Icons.group_add_rounded, size: 18),
                label: const Text('Group'),
              ),
            ],
          ),
          if (state.social.conversations.isEmpty)
            const EmptyLine('No chats yet')
          else
            for (final conversation in state.social.conversations)
              MobileSheetRow(
                selected:
                    conversation.id == state.selectedConversationId &&
                    state.workspace == WorkspaceKind.direct,
                icon: conversation.isGroup
                    ? Icons.groups_rounded
                    : Icons.alternate_email_rounded,
                title: conversation.displayTitle,
                subtitle: conversation.lastMessage?.content.isNotEmpty == true
                    ? conversation.lastMessage!.content
                    : conversation.lastMessage?.attachmentName ??
                          conversation.subtitleLabel,
                trailing: state.unreadConversationIds.contains(conversation.id)
                    ? const UnreadDot()
                    : null,
                onTap: () {
                  Navigator.pop(context);
                  unawaited(state.selectConversation(conversation.id));
                },
              ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.pop(context);
              unawaited(state.selectWorkspace(WorkspaceKind.friends));
            },
            icon: const Icon(Icons.people_alt_rounded),
            label: Text(
              'Friends and requests',
              style: TextStyle(color: palette.text),
            ),
          ),
        ],
      ),
    );
  }
}

class MobileVoiceSheet extends StatelessWidget {
  const MobileVoiceSheet({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return _MobileSheetFrame(
      title: 'Voice rooms',
      icon: state.voiceJoined ? Icons.call_rounded : Icons.graphic_eq_rounded,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: palette.panelSoft,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: palette.border),
            ),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    state.activeVoiceChannel?.name ?? 'Choose a voice room',
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    state.socketStatus == 'connected'
                        ? state.voiceStatus
                        : 'Realtime ${state.socketStatus}',
                    style: TextStyle(color: palette.muted, fontSize: 12),
                  ),
                  if (state.voiceJoined) ...[
                    const SizedBox(height: 8),
                    VoiceQualityPill(stats: state.voiceQuality),
                  ],
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed:
                          state.mediaBusy ||
                              state.selectedVoiceChannelId == null ||
                              (state.socketStatus != 'connected' &&
                                  !state.voiceJoined)
                          ? null
                          : state.joinOrLeaveVoice,
                      icon: state.mediaBusy
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Icon(
                              state.voiceJoined
                                  ? Icons.call_end_rounded
                                  : Icons.call_rounded,
                            ),
                      label: Text(state.voiceJoined ? 'Leave voice' : 'Join'),
                    ),
                  ),
                  if (state.voiceJoined) ...[
                    const SizedBox(height: 12),
                    VoiceControlStrip(state: state),
                  ],
                ],
              ),
            ),
          ),
          const SectionLabel('Rooms'),
          if (state.voiceChannels.isEmpty)
            const EmptyLine('No voice rooms')
          else
            for (final channel in state.voiceChannels)
              MobileVoiceRoomRow(channel: channel, state: state),
          const SectionLabel('Participants'),
          if (state.voiceParticipants.isEmpty)
            const EmptyLine('No active peers')
          else
            for (final participant in state.voiceParticipants)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: VoiceParticipantPresence(
                  participant: participant,
                  onTap: () =>
                      showVoiceParticipantSheet(context, state, participant),
                ),
              ),
        ],
      ),
    );
  }
}

Future<void> showVoiceParticipantSheet(
  BuildContext context,
  WebCordState state,
  VoiceParticipant participant,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (context) => AnimatedBuilder(
      animation: state,
      builder: (context, _) =>
          VoiceParticipantSheet(state: state, participant: participant),
    ),
  );
}

class VoiceParticipantSheet extends StatelessWidget {
  const VoiceParticipantSheet({
    required this.state,
    required this.participant,
    super.key,
  });

  final WebCordState state;
  final VoiceParticipant participant;

  @override
  Widget build(BuildContext context) {
    final user =
        participant.user ??
        PublicUser(id: participant.userId, username: participant.username);
    final volume = state.participantVolume(participant.socketId);
    return _MobileSheetFrame(
      title: participant.displayLabel,
      icon: participant.speaking
          ? Icons.graphic_eq_rounded
          : Icons.person_rounded,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        children: [
          UserProfileSummary(user: user, state: state),
          const SizedBox(height: 12),
          DecoratedBox(
            decoration: BoxDecoration(
              color: WebCordColors.panelSoft,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: WebCordColors.border),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
              child: Row(
                children: [
                  const Icon(Icons.volume_up_rounded),
                  const SizedBox(width: 10),
                  const SizedBox(
                    width: 78,
                    child: Text(
                      'Volume',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  Expanded(
                    child: Slider(
                      value: volume.toDouble(),
                      min: 0,
                      max: 200,
                      divisions: 20,
                      onChanged: (value) => state.setParticipantVolume(
                        participant.socketId,
                        value,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 44,
                    child: Text(
                      '$volume%',
                      textAlign: TextAlign.right,
                      style: const TextStyle(color: WebCordColors.muted),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              FilledButton.icon(
                onPressed: () => showUserProfileSheet(context, state, user),
                icon: const Icon(Icons.badge_rounded),
                label: const Text('Profile'),
              ),
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  state.openDirectUser(user);
                },
                icon: const Icon(Icons.chat_bubble_rounded),
                label: const Text('Message'),
              ),
              if (state.user?.id != user.id && !state.isFriendUser(user.id))
                OutlinedButton.icon(
                  onPressed: () => state.sendFriendRequest(user.username),
                  icon: const Icon(Icons.person_add_alt_1_rounded),
                  label: const Text('Add friend'),
                ),
              if (state.user?.id != user.id)
                OutlinedButton.icon(
                  onPressed: () => state.reportUser(user),
                  icon: const Icon(Icons.flag_rounded),
                  label: const Text('Report'),
                ),
              if (state.user?.id != user.id && !state.isBlockedUser(user.id))
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.pop(context);
                    state.blockUser(user);
                  },
                  icon: const Icon(Icons.block_rounded),
                  label: const Text('Block'),
                ),
              if (state.user?.id != user.id && state.isBlockedUser(user.id))
                OutlinedButton.icon(
                  onPressed: () => state.unblockUser(user),
                  icon: const Icon(Icons.lock_open_rounded),
                  label: const Text('Unblock'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

Future<void> showUserProfileSheet(
  BuildContext context,
  WebCordState state,
  PublicUser user,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _MobileSheetFrame(
      title: user.displayLabel,
      icon: Icons.badge_rounded,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        children: [
          UserProfileSummary(user: user, state: state, expanded: true),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              if (state.user?.id != user.id)
                FilledButton.icon(
                  onPressed: () {
                    Navigator.pop(context);
                    state.openDirectUser(user);
                  },
                  icon: const Icon(Icons.chat_bubble_rounded),
                  label: const Text('Message'),
                ),
              if (state.user?.id != user.id && !state.isFriendUser(user.id))
                OutlinedButton.icon(
                  onPressed: () => state.sendFriendRequest(user.username),
                  icon: const Icon(Icons.person_add_alt_1_rounded),
                  label: const Text('Add friend'),
                ),
            ],
          ),
        ],
      ),
    ),
  );
}

class UserProfileSummary extends StatelessWidget {
  const UserProfileSummary({
    required this.user,
    required this.state,
    this.expanded = false,
    super.key,
  });

  final PublicUser user;
  final WebCordState state;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final accent = _parseHexColor(user.accentColor, palette.accent);
    final trackUrl = user.favoriteTrackUrl;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.panelSoft,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
            child: SizedBox(
              height: expanded ? 150 : 112,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [accent.withAlpha(210), palette.panelStrong],
                      ),
                      image: user.bannerUrl == null
                          ? null
                          : DecorationImage(
                              image: NetworkImage(
                                _resolveMediaUrl(user.bannerUrl!),
                              ),
                              fit: BoxFit.cover,
                            ),
                    ),
                  ),
                  Container(color: Colors.black.withAlpha(55)),
                  Positioned(
                    left: 14,
                    right: 14,
                    bottom: 12,
                    child: Row(
                      children: [
                        UserAvatar(user: user, size: expanded ? 68 : 56),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                user.displayLabel,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 18,
                                ),
                              ),
                              Text(
                                '@${user.username}',
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white70),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.statusText.trim().isEmpty ? 'Online' : user.statusText,
                  style: TextStyle(color: accent, fontWeight: FontWeight.w900),
                ),
                if (user.bio.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(user.bio),
                ],
                if (trackUrl != null && trackUrl.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  ProfileTrackPlayer(
                    url: _resolveMediaUrl(trackUrl),
                    title: user.favoriteTrack.trim().isEmpty
                        ? user.favoriteTrackName ?? 'Profile track'
                        : user.favoriteTrack,
                  ),
                ] else if (user.favoriteTrack.trim().isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(Icons.music_note_rounded, color: palette.cyan),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          user.favoriteTrack,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class ProfileTrackPlayer extends StatelessWidget {
  const ProfileTrackPlayer({required this.url, required this.title, super.key});

  final String url;
  final String title;

  @override
  Widget build(BuildContext context) {
    return VoiceMessagePlayer(url: url, title: title);
  }
}

class _MobileSheetFrame extends StatelessWidget {
  const _MobileSheetFrame({
    required this.title,
    required this.icon,
    required this.child,
  });

  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Padding(
      padding: const EdgeInsets.all(10),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .88,
        ),
        child: Panel(
          padding: EdgeInsets.zero,
          color: palette.panel,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 44,
                height: 4,
                decoration: BoxDecoration(
                  color: palette.muted.withAlpha(80),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 8, 8),
                child: Row(
                  children: [
                    Icon(icon, color: palette.cyan),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        title,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close',
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1, color: WebCordColors.border),
              Flexible(child: child),
            ],
          ),
        ),
      ),
    );
  }
}

class MobileSheetRow extends StatelessWidget {
  const MobileSheetRow({
    required this.selected,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.trailing,
    super.key,
  });

  final bool selected;
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: selected ? palette.accent.withAlpha(60) : palette.panelSoft,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: selected ? palette.accent : palette.border,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Icon(
                  icon,
                  size: 19,
                  color: selected ? palette.cyan : palette.muted,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      if (subtitle != null)
                        Text(
                          subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: palette.muted, fontSize: 12),
                        ),
                    ],
                  ),
                ),
                ?trailing,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class MobileVoiceRoomRow extends StatelessWidget {
  const MobileVoiceRoomRow({
    required this.channel,
    required this.state,
    super.key,
  });

  final Channel channel;
  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final selected = channel.id == state.selectedVoiceChannelId;
    final joinedHere = selected && state.voiceJoined;
    final canUseVoice = state.socketStatus == 'connected' || state.voiceJoined;
    final actionLabel = joinedHere
        ? 'Leave'
        : state.voiceJoined
        ? 'Move'
        : 'Join';

    return MobileSheetRow(
      selected: selected,
      icon: joinedHere ? Icons.call_rounded : Icons.graphic_eq_rounded,
      title: channel.name,
      subtitle: joinedHere
          ? state.voiceStatus
          : selected
          ? 'Selected voice room'
          : 'Tap to select',
      onTap: () => state.selectVoiceChannel(channel.id),
      trailing: SizedBox(
        height: 34,
        child: FilledButton.tonalIcon(
          onPressed: state.mediaBusy || !canUseVoice
              ? null
              : () async {
                  if (state.selectedVoiceChannelId != channel.id) {
                    await state.selectVoiceChannel(channel.id);
                    if (state.voiceJoined) return;
                  }
                  await state.joinOrLeaveVoice();
                },
          icon: Icon(
            joinedHere
                ? Icons.call_end_rounded
                : state.voiceJoined
                ? Icons.swap_horiz_rounded
                : Icons.call_rounded,
            size: 17,
          ),
          label: Text(actionLabel),
        ),
      ),
    );
  }
}

class NavRow extends StatelessWidget {
  const NavRow({
    required this.selected,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.trailing,
    super.key,
  });

  final bool selected;
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: AnimatedContainer(
          duration: wcFastMotion,
          curve: wcEase,
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? palette.accent.withAlpha(66) : Colors.transparent,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected
                  ? palette.accent.withAlpha(170)
                  : Colors.transparent,
            ),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: palette.accent.withAlpha(26),
                      blurRadius: 18,
                      offset: const Offset(0, 8),
                    ),
                  ]
                : null,
          ),
          child: Row(
            children: [
              Icon(
                icon,
                size: 18,
                color: selected ? palette.cyan : palette.muted,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: WebCordColors.muted,
                          fontSize: 12,
                        ),
                      ),
                  ],
                ),
              ),
              ?trailing,
            ],
          ),
        ),
      ),
    );
  }
}

class UnreadDot extends StatelessWidget {
  const UnreadDot({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        color: WebCordColors.cyan,
        borderRadius: BorderRadius.circular(99),
        boxShadow: [
          BoxShadow(color: WebCordColors.cyan.withAlpha(100), blurRadius: 10),
        ],
      ),
    );
  }
}

class UserRow extends StatelessWidget {
  const UserRow({
    required this.user,
    required this.subtitle,
    required this.onTap,
    super.key,
  });

  final PublicUser user;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = user.statusText.trim().isEmpty
        ? subtitle
        : user.statusText.trim();
    final track = user.favoriteTrack.trim();
    final palette = WebCordPalette.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: AnimatedContainer(
          duration: wcFastMotion,
          curve: wcEase,
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: palette.panelSoft.withAlpha(70),
          ),
          child: Row(
            children: [
              UserAvatar(user: user, size: 38),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user.displayLabel,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      status,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: WebCordColors.muted,
                        fontSize: 12,
                      ),
                    ),
                    if (track.isNotEmpty)
                      Text(
                        track,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: WebCordColors.cyan,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class FriendRequestRow extends StatelessWidget {
  const FriendRequestRow({
    required this.request,
    required this.onAccept,
    required this.onDecline,
    super.key,
  });

  final FriendRequest request;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: WebCordColors.panelSoft,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: WebCordColors.border),
        ),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                request.user.displayLabel,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: onAccept,
                      child: const Text('Accept'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: onDecline,
                      child: const Text('Decline'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AttachmentChip extends StatelessWidget {
  const AttachmentChip({required this.message, required this.state, super.key});

  final ChatMessage message;
  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final uri = state.api.attachmentUri(message.attachmentUrl!);
    final kind = _attachmentKind(message);
    final title = message.attachmentName ?? 'Attachment';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!state.inlineMediaPreviews &&
            kind != _AttachmentKind.file &&
            kind != _AttachmentKind.voice)
          MediaPreviewChip(
            icon: _attachmentIcon(message),
            title: title,
            subtitle: kind == _AttachmentKind.image
                ? 'Image preview disabled'
                : kind == _AttachmentKind.circleVideo
                ? 'Circle video preview disabled'
                : 'Video preview disabled',
            onPressed: () => showMediaViewer(context, message, state),
          ),
        if (state.inlineMediaPreviews && kind == _AttachmentKind.image)
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () => showMediaViewer(context, message, state),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                uri.toString(),
                width: 260,
                height: 160,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const SizedBox.shrink(),
              ),
            ),
          ),
        if (state.inlineMediaPreviews && kind == _AttachmentKind.circleVideo)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: InlineVideoAttachment(
              url: uri.toString(),
              title: title,
              circular: true,
              onOpen: () => showMediaViewer(context, message, state),
            ),
          ),
        if (kind == _AttachmentKind.voice)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: VoiceMessagePlayer(url: uri.toString(), title: title),
          ),
        if (state.inlineMediaPreviews && kind == _AttachmentKind.video)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: InlineVideoAttachment(
              url: uri.toString(),
              title: title,
              onOpen: () => showMediaViewer(context, message, state),
            ),
          ),
        const SizedBox(height: 6),
        if (kind == _AttachmentKind.file)
          ActionChip(
            avatar: Icon(_attachmentIcon(message), size: 16),
            label: Text(title),
            onPressed: () => state.openAttachment(message),
          ),
      ],
    );
  }
}

class MediaPreviewChip extends StatelessWidget {
  const MediaPreviewChip({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onPressed,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 280),
      child: ActionChip(
        avatar: Icon(icon, size: 18),
        label: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
            Text(
              subtitle,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: palette.muted, fontSize: 11),
            ),
          ],
        ),
        onPressed: onPressed,
      ),
    );
  }
}

class InlineVideoAttachment extends StatefulWidget {
  const InlineVideoAttachment({
    required this.url,
    required this.title,
    required this.onOpen,
    this.circular = false,
    super.key,
  });

  final String url;
  final String title;
  final VoidCallback onOpen;
  final bool circular;

  @override
  State<InlineVideoAttachment> createState() => _InlineVideoAttachmentState();
}

class _InlineVideoAttachmentState extends State<InlineVideoAttachment> {
  late final Player _player;
  late final VideoController _controller;
  final _subscriptions = <StreamSubscription<dynamic>>[];
  bool _playing = false;
  bool _ready = false;
  bool _failed = false;
  int? _videoWidth;
  int? _videoHeight;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;

  @override
  void initState() {
    super.initState();
    _player = Player();
    _controller = VideoController(_player);
    _subscriptions
      ..add(
        _player.stream.playing.listen((value) {
          if (mounted) setState(() => _playing = value);
        }),
      )
      ..add(
        _player.stream.position.listen((value) {
          if (mounted) setState(() => _position = value);
        }),
      )
      ..add(
        _player.stream.duration.listen((value) {
          if (mounted) setState(() => _duration = value);
        }),
      )
      ..add(
        _player.stream.width.listen((value) {
          if (mounted) setState(() => _videoWidth = value);
        }),
      )
      ..add(
        _player.stream.height.listen((value) {
          if (mounted) setState(() => _videoHeight = value);
        }),
      )
      ..add(
        _player.stream.completed.listen((value) {
          if (value) {
            _player.pause();
            _player.seek(Duration.zero);
          }
        }),
      );
    _player
        .open(Media(widget.url), play: false)
        .then((_) {
          if (mounted) setState(() => _ready = true);
        })
        .catchError((_) {
          if (mounted) setState(() => _failed = true);
        });
  }

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      subscription.cancel();
    }
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final totalMs = _duration.inMilliseconds;
    final progress = totalMs <= 0
        ? 0.0
        : (_position.inMilliseconds / totalMs).clamp(0.0, 1.0);

    if (widget.circular) {
      return SizedBox.square(
        dimension: 156,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: palette.accent.withAlpha(55),
                      blurRadius: 20,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: ClipOval(child: _videoSurface(BoxFit.cover, palette)),
              ),
            ),
            Positioned.fill(
              child: CustomPaint(
                painter: _CircleProgressPainter(
                  progress: progress,
                  color: palette.cyan,
                ),
              ),
            ),
            Positioned.fill(
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: _ready ? _player.playOrPause : null,
                  child: Center(child: _playOverlay()),
                ),
              ),
            ),
            Positioned(
              right: 0,
              top: 2,
              child: IconButton.filledTonal(
                tooltip: 'Open player',
                onPressed: widget.onOpen,
                iconSize: 18,
                icon: const Icon(Icons.fullscreen_rounded),
              ),
            ),
          ],
        ),
      );
    }

    return SizedBox(
      width: 280,
      height: 168,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: palette.panelStrong,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: palette.border),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Stack(
            fit: StackFit.expand,
            children: [
              _videoSurface(BoxFit.cover, palette),
              Positioned.fill(
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: _ready ? _player.playOrPause : null,
                    child: Center(child: _playOverlay()),
                  ),
                ),
              ),
              Positioned(
                left: 10,
                right: 52,
                bottom: 10,
                child: Text(
                  widget.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    shadows: [Shadow(blurRadius: 8, color: Colors.black)],
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 3,
                  backgroundColor: Colors.white.withAlpha(34),
                  valueColor: AlwaysStoppedAnimation<Color>(palette.cyan),
                ),
              ),
              Positioned(
                right: 8,
                top: 8,
                child: IconButton.filledTonal(
                  tooltip: 'Open player',
                  onPressed: widget.onOpen,
                  iconSize: 18,
                  icon: const Icon(Icons.fullscreen_rounded),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _videoSurface(BoxFit fit, WebCordPalette palette) {
    if (_failed) {
      return ColoredBox(
        color: palette.panelStrong,
        child: const Center(child: Icon(Icons.broken_image_rounded, size: 36)),
      );
    }
    if (!_ready) {
      return DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [palette.panelStrong, palette.accent.withAlpha(120)],
          ),
        ),
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    return _AspectSafeVideo(
      controller: _controller,
      fit: fit,
      width: _videoWidth,
      height: _videoHeight,
      controls: NoVideoControls,
    );
  }

  Widget _playOverlay() {
    if (!_ready) return const SizedBox.shrink();
    return AnimatedOpacity(
      opacity: _playing ? 0.0 : 1.0,
      duration: const Duration(milliseconds: 160),
      child: Container(
        width: widget.circular ? 54 : 58,
        height: widget.circular ? 54 : 58,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.black.withAlpha(130),
          border: Border.all(color: Colors.white.withAlpha(54)),
        ),
        child: Icon(
          _playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
          color: Colors.white,
          size: widget.circular ? 34 : 38,
        ),
      ),
    );
  }
}

class _CircleProgressPainter extends CustomPainter {
  const _CircleProgressPainter({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = 4.0;
    final rect =
        Offset(stroke / 2, stroke / 2) &
        Size(size.width - stroke, size.height - stroke);
    final backgroundPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withAlpha(34);
    final progressPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = color;
    canvas.drawOval(rect, backgroundPaint);
    canvas.drawArc(
      rect,
      -1.5708,
      6.28318 * progress.clamp(0.0, 1.0),
      false,
      progressPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _CircleProgressPainter oldDelegate) {
    return oldDelegate.progress != progress || oldDelegate.color != color;
  }
}

class _AspectSafeVideo extends StatelessWidget {
  const _AspectSafeVideo({
    required this.controller,
    required this.fit,
    required this.controls,
    this.width,
    this.height,
  });

  final VideoController controller;
  final BoxFit fit;
  final VideoControlsBuilder? controls;
  final int? width;
  final int? height;

  @override
  Widget build(BuildContext context) {
    final video = Video(
      controller: controller,
      fit: BoxFit.fill,
      controls: controls,
    );
    final w = width ?? 0;
    final h = height ?? 0;
    if (w <= 0 || h <= 0) {
      return Video(controller: controller, fit: fit, controls: controls);
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        return ClipRect(
          child: FittedBox(
            fit: fit,
            clipBehavior: Clip.hardEdge,
            child: SizedBox(
              width: w.toDouble(),
              height: h.toDouble(),
              child: video,
            ),
          ),
        );
      },
    );
  }
}

class VoiceMessagePlayer extends StatefulWidget {
  const VoiceMessagePlayer({required this.url, required this.title, super.key});

  final String url;
  final String title;

  @override
  State<VoiceMessagePlayer> createState() => _VoiceMessagePlayerState();
}

class _VoiceMessagePlayerState extends State<VoiceMessagePlayer> {
  late final Player _player;
  final _subscriptions = <StreamSubscription<dynamic>>[];
  bool _playing = false;
  bool _ready = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;

  @override
  void initState() {
    super.initState();
    _player = Player();
    _subscriptions
      ..add(
        _player.stream.playing.listen((value) {
          if (mounted) setState(() => _playing = value);
        }),
      )
      ..add(
        _player.stream.position.listen((value) {
          if (mounted) setState(() => _position = value);
        }),
      )
      ..add(
        _player.stream.duration.listen((value) {
          if (mounted) setState(() => _duration = value);
        }),
      )
      ..add(
        _player.stream.completed.listen((value) {
          if (value) _player.seek(Duration.zero);
        }),
      );
    _player.open(Media(widget.url), play: false).then((_) {
      if (mounted) setState(() => _ready = true);
    });
  }

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      subscription.cancel();
    }
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final totalMs = _duration.inMilliseconds;
    final progress = totalMs <= 0
        ? 0.0
        : (_position.inMilliseconds / totalMs).clamp(0.0, 1.0);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.panelStrong,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton.filledTonal(
              tooltip: _playing ? 'Pause' : 'Play',
              onPressed: _ready ? _player.playOrPause : null,
              icon: Icon(
                _playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
              ),
            ),
            const SizedBox(width: 9),
            SizedBox(
              width: 112,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  _ProgressWaveform(color: palette.cyan, progress: progress),
                  const SizedBox(height: 5),
                  Text(
                    '${_durationLabel(_position)} / ${_durationLabel(_duration)}',
                    style: TextStyle(color: palette.muted, fontSize: 11),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 9),
            Flexible(
              child: Text(
                'Voice',
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: palette.text,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProgressWaveform extends StatelessWidget {
  const _ProgressWaveform({required this.color, required this.progress});

  final Color color;
  final double progress;

  @override
  Widget build(BuildContext context) {
    const heights = [12.0, 20.0, 15.0, 24.0, 17.0, 10.0, 21.0, 14.0, 19.0];
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        for (var index = 0; index < heights.length; index++)
          Container(
            width: 4,
            height: heights[index],
            decoration: BoxDecoration(
              color: index / heights.length <= progress
                  ? color
                  : color.withAlpha(62),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
      ],
    );
  }
}

class UserAvatar extends StatelessWidget {
  const UserAvatar({required this.user, this.size = 36, super.key});

  final PublicUser? user;
  final double size;

  @override
  Widget build(BuildContext context) {
    final avatar = user?.avatarUrl;
    final palette = WebCordPalette.of(context);
    final accent = user == null
        ? palette.accent
        : _parseHexColor(user!.accentColor, palette.accent);
    final secondary = Color.lerp(accent, WebCordColors.cyan, .45) ?? accent;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(colors: [accent, secondary]),
        border: Border.all(color: accent.withAlpha(144)),
        boxShadow: [
          BoxShadow(
            color: accent.withAlpha(48),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipOval(
        child: avatar == null
            ? Center(
                child: Text(
                  (user?.displayLabel ?? '?').characters.first.toUpperCase(),
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: size * .42,
                  ),
                ),
              )
            : Image.network(_resolveMediaUrl(avatar), fit: BoxFit.cover),
      ),
    );
  }
}

class ConversationAvatar extends StatelessWidget {
  const ConversationAvatar({
    required this.conversation,
    this.size = 36,
    super.key,
  });

  final DirectConversation conversation;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (!conversation.isGroup && conversation.user != null) {
      return UserAvatar(user: conversation.user, size: size);
    }
    final palette = WebCordPalette.of(context);
    final avatarUrl = conversation.avatarUrl;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(colors: [palette.accent, palette.cyan]),
        border: Border.all(color: palette.cyan.withAlpha(120)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(13),
        child: avatarUrl == null
            ? Icon(Icons.groups_rounded, color: Colors.white, size: size * .54)
            : Image.network(_resolveMediaUrl(avatarUrl), fit: BoxFit.cover),
      ),
    );
  }
}

String _resolveMediaUrl(String value) {
  if (value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('data:') ||
      value.startsWith('blob:')) {
    return value;
  }
  final apiUrl = const String.fromEnvironment(
    'WEBCORD_API_URL',
    defaultValue: 'https://webcordes.ru/api',
  );
  final uri = Uri.parse(apiUrl);
  final origin =
      '${uri.scheme}://${uri.host}${uri.hasPort ? ':${uri.port}' : ''}';
  return '$origin$value';
}

class BrandLockup extends StatelessWidget {
  const BrandLockup({this.size = 32, super.key});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        BrandMark(size: size),
        SizedBox(width: size * .32),
        Text(
          'WebCord',
          style: TextStyle(
            fontSize: size * .72,
            fontWeight: FontWeight.w900,
            color: WebCordColors.text,
          ),
        ),
      ],
    );
  }
}

class BrandMark extends StatelessWidget {
  const BrandMark({this.size = 32, super.key});

  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(size * .22),
        child: Image.asset(
          'assets/images/webcord.png',
          fit: BoxFit.cover,
          filterQuality: FilterQuality.high,
        ),
      ),
    );
  }
}

class LivePill extends StatelessWidget {
  const LivePill({required this.status, super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    final live = status == 'connected';
    return DecoratedBox(
      decoration: BoxDecoration(
        color: (live ? WebCordColors.success : WebCordColors.accent).withAlpha(
          34,
        ),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: live ? WebCordColors.success : WebCordColors.border,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.circle,
              size: 8,
              color: live ? WebCordColors.success : WebCordColors.muted,
            ),
            const SizedBox(width: 6),
            Text(
              live ? 'Live' : status,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
            ),
          ],
        ),
      ),
    );
  }
}

class VoiceQualityPill extends StatelessWidget {
  const VoiceQualityPill({
    required this.stats,
    this.compact = false,
    super.key,
  });

  final VoiceQualityStats stats;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final color = switch (stats.label) {
      'Good' => WebCordColors.success,
      'Fair' => WebCordColors.cyan,
      'Poor' => WebCordColors.danger,
      _ => palette.muted,
    };
    final loss = stats.packetLossPercent.toStringAsFixed(
      stats.packetLossPercent >= 10 ? 0 : 1,
    );
    final details = compact
        ? '${stats.rttMs}ms ${stats.routeLabel}'
        : '${stats.rttMs}ms | ${stats.jitterMs}j | $loss% loss | ${stats.routeLabel}';

    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withAlpha(28),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withAlpha(120)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              stats.speaking ? Icons.graphic_eq_rounded : Icons.network_check,
              size: 14,
              color: color,
            ),
            const SizedBox(width: 6),
            Text(
              '${stats.label} | $details',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
            ),
          ],
        ),
      ),
    );
  }
}

class VoiceDiagnosticsPanel extends StatelessWidget {
  const VoiceDiagnosticsPanel({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final stats = state.voiceQuality;
    final warning = stats.packetLossPercent >= 4 || stats.jitterMs >= 40;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.panelSoft.withAlpha(230),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: warning ? WebCordColors.danger.withAlpha(130) : palette.border,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.network_check_rounded, size: 18),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Voice diagnostics',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                VoiceQualityPill(stats: stats, compact: true),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _DiagnosticChip(
                  label: 'Mode',
                  value: state.voiceAudioProfile.label,
                ),
                _DiagnosticChip(label: 'RTT', value: '${stats.rttMs} ms'),
                _DiagnosticChip(label: 'Jitter', value: '${stats.jitterMs} ms'),
                _DiagnosticChip(
                  label: 'Loss',
                  value: '${stats.packetLossPercent.toStringAsFixed(1)}%',
                ),
                _DiagnosticChip(
                  label: 'In',
                  value: '${stats.inboundKbps} kbps',
                ),
                _DiagnosticChip(
                  label: 'Out',
                  value: '${stats.outboundKbps} kbps',
                ),
                _DiagnosticChip(label: 'Route', value: stats.routeLabel),
              ],
            ),
            if (warning) ...[
              const SizedBox(height: 10),
              Text(
                stats.usingRelay
                    ? 'Relay route is active. Quality depends on TURN and the network path.'
                    : 'Jitter or packet loss is high. Try Low Data mode or switch network.',
                style: TextStyle(
                  color: WebCordColors.danger.withAlpha(230),
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DiagnosticChip extends StatelessWidget {
  const _DiagnosticChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.bgAlt.withAlpha(180),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                color: palette.muted,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(width: 6),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w900)),
          ],
        ),
      ),
    );
  }
}

class StatTile extends StatelessWidget {
  const StatTile({required this.label, required this.value, super.key});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 150,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: WebCordColors.panelSoft,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: WebCordColors.border),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(label, style: const TextStyle(color: WebCordColors.muted)),
            ],
          ),
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.icon,
    required this.title,
    required this.body,
    super.key,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 42, color: WebCordColors.cyan),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 6),
            Text(
              body,
              textAlign: TextAlign.center,
              style: const TextStyle(color: WebCordColors.muted),
            ),
          ],
        ),
      ),
    );
  }
}

class EmptyLine extends StatelessWidget {
  const EmptyLine(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(text, style: const TextStyle(color: WebCordColors.muted)),
    );
  }
}

class ErrorToast extends StatelessWidget {
  const ErrorToast({required this.message, required this.onClose, super.key});

  final String message;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xFF2A1220),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: WebCordColors.danger.withAlpha(120)),
          boxShadow: const [
            BoxShadow(
              color: Colors.black54,
              blurRadius: 24,
              offset: Offset(0, 10),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              const Icon(
                Icons.error_outline_rounded,
                color: WebCordColors.danger,
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(message)),
              IconButton(
                tooltip: 'Dismiss',
                onPressed: onClose,
                icon: const Icon(Icons.close_rounded),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> showCreateChannelDialog(
  BuildContext context,
  WebCordState state,
  ChannelKind kind,
) async {
  final controller = TextEditingController();
  final result = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      backgroundColor: WebCordColors.panel,
      title: Text(
        kind == ChannelKind.voice ? 'Create voice room' : 'Create text channel',
      ),
      content: TextField(
        controller: controller,
        autofocus: true,
        decoration: const InputDecoration(hintText: 'Channel name'),
        onSubmitted: (value) => Navigator.pop(context, value),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, controller.text),
          child: const Text('Create'),
        ),
      ],
    ),
  );
  controller.dispose();
  if (result != null && result.trim().isNotEmpty) {
    state.createChannel(result, kind);
  }
}

Future<void> showCreateGroupDialog(
  BuildContext context,
  WebCordState state,
) async {
  final title = TextEditingController();
  final selected = <int>{};
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setDialogState) => AlertDialog(
        backgroundColor: WebCordColors.panel,
        title: const Text('Create group'),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: title,
                autofocus: true,
                onChanged: (_) => setDialogState(() {}),
                decoration: const InputDecoration(hintText: 'Group name'),
              ),
              const SizedBox(height: 12),
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 320),
                child: state.social.friends.isEmpty
                    ? const EmptyLine('Add friends first')
                    : ListView(
                        shrinkWrap: true,
                        children: [
                          for (final friend in state.social.friends)
                            CheckboxListTile(
                              value: selected.contains(friend.user.id),
                              onChanged: (value) {
                                setDialogState(() {
                                  if (value == true) {
                                    selected.add(friend.user.id);
                                  } else {
                                    selected.remove(friend.user.id);
                                  }
                                });
                              },
                              secondary: UserAvatar(
                                user: friend.user,
                                size: 32,
                              ),
                              title: Text(friend.user.displayLabel),
                              subtitle: Text('@${friend.user.username}'),
                            ),
                        ],
                      ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: title.text.trim().isEmpty || selected.length < 2
                ? null
                : () => Navigator.pop(context, true),
            child: const Text('Create'),
          ),
        ],
      ),
    ),
  );
  final groupTitle = title.text.trim();
  title.dispose();
  if (result == true && groupTitle.isNotEmpty && selected.length >= 2) {
    await state.createGroupConversation(
      title: groupTitle,
      userIds: selected.toList(),
    );
  }
}

Future<void> showEditMessageDialog(
  BuildContext context,
  WebCordState state,
  ChatMessage message,
) async {
  final controller = TextEditingController(text: message.content);
  final result = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      backgroundColor: WebCordColors.panel,
      title: const Text('Edit message'),
      content: TextField(
        controller: controller,
        autofocus: true,
        minLines: 1,
        maxLines: 4,
        decoration: const InputDecoration(hintText: 'Message'),
        onSubmitted: (value) => Navigator.pop(context, value),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, controller.text),
          child: const Text('Save'),
        ),
      ],
    ),
  );
  controller.dispose();
  if (result != null && result.trim().isNotEmpty) {
    state.editMessage(message, result);
  }
}

Future<void> showMediaViewer(
  BuildContext context,
  ChatMessage message,
  WebCordState state, {
  StoryItem? story,
}) {
  return showDialog<void>(
    context: context,
    barrierColor: Colors.black.withAlpha(235),
    builder: (context) =>
        MediaViewerDialog(message: message, state: state, story: story),
  );
}

class MediaViewerDialog extends StatefulWidget {
  const MediaViewerDialog({
    required this.message,
    required this.state,
    this.story,
    super.key,
  });

  final ChatMessage message;
  final WebCordState state;
  final StoryItem? story;

  @override
  State<MediaViewerDialog> createState() => _MediaViewerDialogState();
}

class _MediaViewerDialogState extends State<MediaViewerDialog> {
  Player? _player;
  VideoController? _controller;
  final _subscriptions = <StreamSubscription<dynamic>>[];
  int? _videoWidth;
  int? _videoHeight;

  _AttachmentKind get _kind => _attachmentKind(widget.message);
  bool get _isImage => _kind == _AttachmentKind.image;
  bool get _isVideo =>
      _kind == _AttachmentKind.video || _kind == _AttachmentKind.circleVideo;
  bool get _isCircle => _kind == _AttachmentKind.circleVideo;
  bool get _isVoice => _kind == _AttachmentKind.voice;

  Uri get _uri => widget.state.api.attachmentUri(widget.message.attachmentUrl!);

  @override
  void initState() {
    super.initState();
    if (_isVideo) {
      final player = Player();
      _player = player;
      _controller = VideoController(player);
      _subscriptions
        ..add(
          player.stream.width.listen((value) {
            if (mounted) setState(() => _videoWidth = value);
          }),
        )
        ..add(
          player.stream.height.listen((value) {
            if (mounted) setState(() => _videoHeight = value);
          }),
        );
      player.open(Media(_uri.toString()));
    }
  }

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      subscription.cancel();
    }
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.message.attachmentName ?? 'Media';
    return Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(child: Center(child: _viewerBody())),
            if (widget.story != null &&
                (widget.story!.caption.isNotEmpty || widget.story!.hasMusic))
              Positioned(
                left: 14,
                right: 14,
                bottom: 14,
                child: _StoryViewerInfo(
                  story: widget.story!,
                  state: widget.state,
                ),
              ),
            Positioned(
              left: 12,
              right: 12,
              top: 10,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.black.withAlpha(135),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.white.withAlpha(26)),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 6,
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        tooltip: 'Close',
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close_rounded),
                      ),
                      Expanded(
                        child: Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _viewerBody() {
    if (_isImage) {
      return InteractiveViewer(
        minScale: 0.75,
        maxScale: 5,
        child: Image.network(
          _uri.toString(),
          fit: BoxFit.contain,
          errorBuilder: (_, _, _) => const Icon(
            Icons.broken_image_rounded,
            color: Colors.white,
            size: 52,
          ),
        ),
      );
    }

    if (_isVideo && _controller != null) {
      final video = _AspectSafeVideo(
        controller: _controller!,
        fit: BoxFit.contain,
        width: _videoWidth,
        height: _videoHeight,
        controls: AdaptiveVideoControls,
      );
      if (!_isCircle) return video;
      return ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420, maxHeight: 420),
        child: AspectRatio(aspectRatio: 1, child: ClipOval(child: video)),
      );
    }

    if (_isVoice) {
      return VoiceMessagePlayer(
        url: _uri.toString(),
        title: widget.message.attachmentName ?? 'Voice message',
      );
    }

    return const Icon(
      Icons.insert_drive_file_rounded,
      color: Colors.white,
      size: 52,
    );
  }
}

class _StoryViewerInfo extends StatelessWidget {
  const _StoryViewerInfo({required this.story, required this.state});

  final StoryItem story;
  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Align(
      alignment: Alignment.bottomCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: Panel(
          padding: const EdgeInsets.all(14),
          color: Colors.black.withAlpha(138),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (story.caption.isNotEmpty)
                Text(
                  story.caption,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
              if (story.caption.isNotEmpty && story.hasMusic)
                const SizedBox(height: 10),
              if (story.hasMusic)
                ProfileTrackPlayer(
                  url: state.api.attachmentUri(story.musicUrl!).toString(),
                  title: story.musicLabel.isEmpty
                      ? 'Story music'
                      : story.musicLabel,
                ),
              if (!story.hasMusic)
                Text(
                  '${story.viewCount} views',
                  style: TextStyle(color: palette.muted, fontSize: 12),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> showCircleRecorder(BuildContext context, WebCordState state) {
  return showDialog<void>(
    context: context,
    barrierColor: Colors.black.withAlpha(235),
    builder: (context) => CircleRecorderDialog(state: state),
  );
}

class CircleRecorderDialog extends StatefulWidget {
  const CircleRecorderDialog({required this.state, super.key});

  final WebCordState state;

  @override
  State<CircleRecorderDialog> createState() => _CircleRecorderDialogState();
}

class _CircleRecorderDialogState extends State<CircleRecorderDialog> {
  final _previewSubscriptions = <StreamSubscription<dynamic>>[];
  List<CameraDescription> _cameras = [];
  CameraController? _cameraController;
  Player? _previewPlayer;
  VideoController? _previewController;
  int? _previewWidth;
  int? _previewHeight;
  XFile? _recordedFile;
  Timer? _timer;
  Duration _elapsed = Duration.zero;
  int _activeCameraIndex = 0;
  bool _loading = true;
  bool _recording = false;
  bool _sending = false;
  bool _switchingCamera = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initializeCamera();
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final subscription in _previewSubscriptions) {
      subscription.cancel();
    }
    if (_cameraController?.value.isRecordingVideo ?? false) {
      unawaited(
        _cameraController!.stopVideoRecording().catchError((_) => XFile('')),
      );
    }
    unawaited(_cameraController?.dispose() ?? Future.value());
    unawaited(_previewPlayer?.dispose() ?? Future.value());
    super.dispose();
  }

  Future<void> _initializeCamera([int? index]) async {
    setState(() {
      _loading = true;
      _error = null;
      _recordedFile = null;
    });
    await _disposePreview();

    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        if (mounted) {
          setState(() {
            _cameras = [];
            _loading = false;
            _error = 'Camera not found';
          });
        }
        return;
      }

      final nextIndex = (index ?? _preferredCameraIndex(cameras)).clamp(
        0,
        cameras.length - 1,
      );
      final controller = CameraController(
        cameras[nextIndex],
        ResolutionPreset.medium,
        enableAudio: true,
      );

      final previous = _cameraController;
      _cameraController = controller;
      _cameras = cameras;
      _activeCameraIndex = nextIndex;
      await previous?.dispose();

      await controller.initialize();
      try {
        await controller.prepareForVideoRecording();
      } catch (_) {
        // Some desktop camera backends do not need explicit prewarm.
      }

      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _loading = false);
    } catch (exception) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _friendlyCameraError(exception);
      });
    }
  }

  int _preferredCameraIndex(List<CameraDescription> cameras) {
    return _bestCameraIndex(cameras, CameraLensDirection.front) ??
        _bestCameraIndex(cameras, CameraLensDirection.back) ??
        _bestAnyCameraIndex(cameras);
  }

  Future<void> _switchCamera() async {
    if (_sending || _switchingCamera || _cameras.length < 2) return;
    final current = _cameras[_activeCameraIndex];
    final targetDirection = current.lensDirection == CameraLensDirection.front
        ? CameraLensDirection.back
        : CameraLensDirection.front;
    final next =
        _bestCameraIndex(_cameras, targetDirection) ??
        _bestAnyCameraIndex(_cameras, excludeIndex: _activeCameraIndex);

    if (_recording) {
      final controller = _cameraController;
      if (controller == null || !controller.value.isInitialized) return;
      setState(() => _switchingCamera = true);
      try {
        await controller.setDescription(_cameras[next]);
        if (!mounted) return;
        setState(() {
          _activeCameraIndex = next;
          _error = null;
        });
      } catch (exception) {
        if (!mounted) return;
        setState(() {
          _error =
              'This device cannot switch cameras during the current recording. '
              'Stop the circle or try another camera.';
        });
      } finally {
        if (mounted) setState(() => _switchingCamera = false);
      }
      return;
    }

    await _initializeCamera(next);
  }

  int? _bestCameraIndex(
    List<CameraDescription> cameras,
    CameraLensDirection direction,
  ) {
    final candidates = <({int index, CameraDescription camera})>[];
    for (var index = 0; index < cameras.length; index++) {
      final camera = cameras[index];
      if (camera.lensDirection == direction) {
        candidates.add((index: index, camera: camera));
      }
    }
    if (candidates.isEmpty) return null;
    candidates.sort((left, right) {
      final lensScore = _cameraLensScore(
        left.camera,
      ).compareTo(_cameraLensScore(right.camera));
      if (lensScore != 0) return lensScore;
      return left.index.compareTo(right.index);
    });
    return candidates.first.index;
  }

  int _bestAnyCameraIndex(
    List<CameraDescription> cameras, {
    int? excludeIndex,
  }) {
    final candidates = <({int index, CameraDescription camera})>[];
    for (var index = 0; index < cameras.length; index++) {
      if (index != excludeIndex) {
        candidates.add((index: index, camera: cameras[index]));
      }
    }
    if (candidates.isEmpty) return 0;
    candidates.sort((left, right) {
      final lensScore = _cameraLensScore(
        left.camera,
      ).compareTo(_cameraLensScore(right.camera));
      if (lensScore != 0) return lensScore;
      return left.index.compareTo(right.index);
    });
    return candidates.first.index;
  }

  int _cameraLensScore(CameraDescription camera) {
    final name = camera.name.toLowerCase();
    if (camera.lensType == CameraLensType.ultraWide ||
        name.contains('ultra') ||
        name.contains('0.5')) {
      return 30;
    }
    if (camera.lensType == CameraLensType.wide || name.contains('wide')) {
      return 0;
    }
    if (camera.lensType == CameraLensType.unknown) return 5;
    if (camera.lensType == CameraLensType.telephoto) return 10;
    return 20;
  }

  Future<void> _startRecording() async {
    final controller = _cameraController;
    if (controller == null ||
        !controller.value.isInitialized ||
        _recording ||
        _sending) {
      return;
    }

    try {
      await _disposePreview();
      await _deleteRecordedFile();
      await controller.startVideoRecording();
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) {
          setState(() => _elapsed += const Duration(seconds: 1));
        }
      });
      setState(() {
        _recording = true;
        _elapsed = Duration.zero;
        _error = null;
      });
    } catch (exception) {
      if (!mounted) return;
      setState(() => _error = _friendlyCameraError(exception));
    }
  }

  Future<void> _stopRecording() async {
    final controller = _cameraController;
    if (controller == null || !controller.value.isRecordingVideo) return;

    try {
      final file = await controller.stopVideoRecording();
      _timer?.cancel();
      if (!mounted) return;
      setState(() {
        _recording = false;
        _recordedFile = file;
      });
      await _loadRecordedPreview(file.path);
    } catch (exception) {
      if (!mounted) return;
      setState(() {
        _recording = false;
        _error = _friendlyCameraError(exception);
      });
    }
  }

  Future<void> _loadRecordedPreview(String path) async {
    await _disposePreview();
    final player = Player();
    final controller = VideoController(player);
    _previewPlayer = player;
    _previewController = controller;
    _previewSubscriptions.add(
      player.stream.completed.listen((completed) {
        if (completed) {
          player.seek(Duration.zero);
          player.play();
        }
      }),
    );
    _previewSubscriptions
      ..add(
        player.stream.width.listen((value) {
          if (mounted) setState(() => _previewWidth = value);
        }),
      )
      ..add(
        player.stream.height.listen((value) {
          if (mounted) setState(() => _previewHeight = value);
        }),
      );
    await player.open(Media(File(path).uri.toString()), play: true);
    if (mounted) setState(() {});
  }

  Future<void> _sendRecording() async {
    final recorded = _recordedFile;
    if (recorded == null || _sending) return;

    setState(() {
      _sending = true;
      _error = null;
    });

    try {
      final file = await _circleUploadFile(recorded);
      await widget.state.sendRecordedMedia(file);
      if (mounted) Navigator.pop(context);
    } catch (exception) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = '$exception';
      });
    }
  }

  Future<File> _circleUploadFile(XFile recorded) async {
    final source = File(recorded.path);
    if (!await source.exists()) {
      throw Exception('Recorded video file was not created');
    }
    final extension = _fileExtension(recorded.path);
    final target = File(
      '${Directory.systemTemp.path}${Platform.pathSeparator}'
      'webcord-circle-video-${DateTime.now().millisecondsSinceEpoch}'
      '$extension',
    );
    return source.copy(target.path);
  }

  Future<void> _discardRecording() async {
    if (_recording) {
      await _stopRecording();
    }
    await _disposePreview();
    await _deleteRecordedFile();
    if (mounted) {
      setState(() {
        _recordedFile = null;
        _elapsed = Duration.zero;
        _error = null;
      });
    }
  }

  Future<void> _deleteRecordedFile() async {
    final recorded = _recordedFile;
    _recordedFile = null;
    if (recorded == null) return;
    try {
      final file = File(recorded.path);
      if (await file.exists()) await file.delete();
    } catch (_) {
      // Temporary recorder files are best-effort cleanup.
    }
  }

  Future<void> _disposePreview() async {
    for (final subscription in _previewSubscriptions) {
      await subscription.cancel();
    }
    _previewSubscriptions.clear();
    final player = _previewPlayer;
    _previewPlayer = null;
    _previewController = null;
    _previewWidth = null;
    _previewHeight = null;
    if (player != null) await player.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final media = MediaQuery.sizeOf(context);
    final circleSize = (media.shortestSide - 72).clamp(220.0, 360.0);

    return Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: SafeArea(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(0.1, -0.35),
              radius: 1.15,
              colors: [
                palette.accent.withAlpha(72),
                Colors.black,
                Colors.black,
              ],
            ),
          ),
          child: Stack(
            children: [
              Positioned(
                left: 12,
                right: 12,
                top: 10,
                child: Row(
                  children: [
                    IconButton(
                      tooltip: 'Close',
                      onPressed: _sending ? null : () => Navigator.pop(context),
                      icon: const Icon(Icons.close_rounded),
                    ),
                    const Expanded(
                      child: Text(
                        'Video circle',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Switch camera',
                      onPressed:
                          _cameras.length > 1 && !_sending && !_switchingCamera
                          ? _switchCamera
                          : null,
                      icon: _switchingCamera
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.cameraswitch_rounded),
                    ),
                  ],
                ),
              ),
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox.square(
                      dimension: circleSize,
                      child: Stack(
                        children: [
                          Positioned.fill(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: _recording
                                      ? WebCordColors.danger
                                      : palette.cyan.withAlpha(170),
                                  width: 3,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color:
                                        (_recording
                                                ? WebCordColors.danger
                                                : palette.cyan)
                                            .withAlpha(70),
                                    blurRadius: 32,
                                    offset: const Offset(0, 16),
                                  ),
                                ],
                              ),
                              child: ClipOval(
                                child: _recorderSurface(circleSize, palette),
                              ),
                            ),
                          ),
                          if (_recording)
                            Positioned(
                              left: 0,
                              right: 0,
                              top: 16,
                              child: Center(
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    color: Colors.black.withAlpha(150),
                                    borderRadius: BorderRadius.circular(999),
                                    border: Border.all(
                                      color: Colors.white.withAlpha(34),
                                    ),
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 6,
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(
                                          Icons.fiber_manual_record_rounded,
                                          color: WebCordColors.danger,
                                          size: 14,
                                        ),
                                        const SizedBox(width: 6),
                                        Text(
                                          _durationLabel(_elapsed),
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w900,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 28),
                    _recorderControls(palette),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 460),
                          child: Text(
                            _error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: WebCordColors.danger,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _recorderSurface(double size, WebCordPalette palette) {
    if (_loading) {
      return ColoredBox(
        color: palette.panel,
        child: const Center(child: CircularProgressIndicator()),
      );
    }
    if (_previewController != null) {
      return GestureDetector(
        onTap: () => _previewPlayer?.playOrPause(),
        child: _AspectSafeVideo(
          controller: _previewController!,
          fit: BoxFit.cover,
          width: _previewWidth,
          height: _previewHeight,
          controls: NoVideoControls,
        ),
      );
    }
    if (_error != null) {
      return ColoredBox(
        color: palette.panel,
        child: const Center(
          child: Icon(
            Icons.videocam_off_rounded,
            color: Colors.white,
            size: 46,
          ),
        ),
      );
    }
    final controller = _cameraController;
    if (controller == null || !controller.value.isInitialized) {
      return ColoredBox(
        color: palette.panel,
        child: const Center(
          child: Icon(Icons.video_camera_front_rounded, size: 46),
        ),
      );
    }
    final aspect = controller.value.aspectRatio <= 0
        ? 1.0
        : controller.value.aspectRatio;
    return FittedBox(
      fit: BoxFit.cover,
      child: SizedBox(
        width: size,
        height: size / aspect,
        child: CameraPreview(controller),
      ),
    );
  }

  Widget _recorderControls(WebCordPalette palette) {
    if (_recordedFile != null) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton.filledTonal(
            tooltip: 'Record again',
            onPressed: _sending ? null : _discardRecording,
            icon: const Icon(Icons.replay_rounded),
          ),
          const SizedBox(width: 14),
          FilledButton.icon(
            onPressed: _sending ? null : _sendRecording,
            icon: _sending
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send_rounded),
            label: const Text('Send'),
          ),
        ],
      );
    }

    return IconButton.filled(
      tooltip: _recording ? 'Stop recording' : 'Start recording',
      onPressed: _loading || _sending
          ? null
          : _recording
          ? _stopRecording
          : _startRecording,
      style: IconButton.styleFrom(
        backgroundColor: _recording ? WebCordColors.danger : palette.accent,
        foregroundColor: Colors.white,
        fixedSize: const Size(74, 74),
      ),
      icon: Icon(
        _recording ? Icons.stop_rounded : Icons.fiber_manual_record_rounded,
        size: 36,
      ),
    );
  }
}

Future<void> showSettingsDialog(BuildContext context, WebCordState state) {
  return showDialog<void>(
    context: context,
    builder: (context) => AnimatedBuilder(
      animation: state,
      builder: (context, _) => SettingsDialog(state: state),
    ),
  );
}

class SettingsDialog extends StatelessWidget {
  const SettingsDialog({required this.state, super.key});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Dialog(
      insetPadding: const EdgeInsets.all(18),
      backgroundColor: Colors.transparent,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: Panel(
          color: palette.panel,
          padding: EdgeInsets.zero,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 12, 12),
                child: Row(
                  children: [
                    const Icon(
                      Icons.settings_rounded,
                      color: WebCordColors.cyan,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Settings',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close',
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1, color: WebCordColors.border),
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(context).height * .72,
                ),
                child: Material(
                  type: MaterialType.transparency,
                  child: ListView(
                    shrinkWrap: true,
                    padding: const EdgeInsets.all(18),
                    children: [
                      Row(
                        children: [
                          UserAvatar(user: state.user, size: 48),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  state.user?.displayLabel ?? 'WebCord user',
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 16,
                                  ),
                                ),
                                Text(
                                  state.socketStatus == 'connected'
                                      ? 'Online'
                                      : state.socketStatus,
                                  style: TextStyle(
                                    color: palette.muted,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          OutlinedButton.icon(
                            onPressed: state.logout,
                            icon: const Icon(Icons.logout_rounded),
                            label: const Text('Logout'),
                          ),
                        ],
                      ),
                      const SectionLabel('Profile'),
                      _ProfileSettingsPanel(state: state),
                      const SectionLabel('Appearance'),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          for (final mode in AppThemeMode.values)
                            _ThemeChoiceCard(
                              mode: mode,
                              selected: state.themeMode == mode,
                              onTap: () => state.setThemeMode(mode),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      SwitchListTile(
                        value: state.compactMessages,
                        onChanged: state.setCompactMessages,
                        secondary: const Icon(Icons.density_small_rounded),
                        title: const Text('Compact messages'),
                      ),
                      const SizedBox(height: 8),
                      _WallpaperSettingsPanel(state: state),
                      const SectionLabel('Media'),
                      SwitchListTile(
                        value: state.inlineMediaPreviews,
                        onChanged: state.setInlineMediaPreviews,
                        secondary: const Icon(Icons.photo_library_rounded),
                        title: const Text('Inline media previews'),
                        subtitle: const Text(
                          'Turn off to keep image and video attachments as light chips.',
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: state.clearLocalMediaCache,
                          icon: const Icon(Icons.cleaning_services_rounded),
                          label: const Text('Clear local media cache'),
                        ),
                      ),
                      const SectionLabel('Voice & Video'),
                      _VoiceAudioProfileSelector(state: state),
                      const SizedBox(height: 10),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final stacked = constraints.maxWidth < 560;
                          final mic = _SettingsDeviceDropdown(
                            icon: Icons.mic_external_on_rounded,
                            label: 'Microphone',
                            value: state.selectedMicDeviceId,
                            devices: state.microphones,
                            defaultLabel: 'Default microphone',
                            onChanged: state.setMicDevice,
                          );
                          final output = _SettingsDeviceDropdown(
                            icon: Icons.headphones_rounded,
                            label: 'Output',
                            value: state.selectedOutputDeviceId,
                            devices: state.audioOutputs,
                            defaultLabel: 'Default headphones',
                            onChanged: state.setOutputDevice,
                          );
                          if (stacked) {
                            return Column(
                              children: [
                                mic,
                                const SizedBox(height: 10),
                                output,
                              ],
                            );
                          }
                          return Row(
                            children: [
                              Expanded(child: mic),
                              const SizedBox(width: 10),
                              Expanded(child: output),
                            ],
                          );
                        },
                      ),
                      const SizedBox(height: 10),
                      _SettingsDeviceDropdown(
                        icon: Icons.videocam_rounded,
                        label: 'Camera',
                        value: state.selectedCameraDeviceId,
                        devices: state.cameras,
                        defaultLabel: 'Default camera',
                        onChanged: state.setCameraDevice,
                      ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: state.refreshMediaDevices,
                          icon: const Icon(Icons.refresh_rounded),
                          label: const Text('Refresh devices'),
                        ),
                      ),
                      _SettingsSlider(
                        icon: Icons.keyboard_voice_rounded,
                        label: 'Mic sensitivity',
                        value: state.inputVolume,
                        onChanged: state.setInputVolume,
                      ),
                      _SettingsSlider(
                        icon: Icons.volume_up_rounded,
                        label: 'Master volume',
                        value: state.outputVolume,
                        onChanged: state.setOutputVolume,
                      ),
                      const SizedBox(height: 8),
                      VoiceDiagnosticsPanel(state: state),
                      SwitchListTile(
                        value: state.noiseSuppressionEnabled,
                        onChanged: state.setNoiseSuppression,
                        secondary: const Icon(Icons.hearing_rounded),
                        title: const Text('Noise suppression'),
                        subtitle: Text(
                          state.voiceAudioProfile ==
                                  VoiceAudioProfile.highFidelity
                              ? 'High Fidelity keeps the mic signal cleaner by bypassing suppression.'
                              : 'Reduces room noise before the voice stream is encoded.',
                        ),
                      ),
                      if (state.voiceJoined) ...[
                        const SizedBox(height: 8),
                        DecoratedBox(
                          decoration: BoxDecoration(
                            color: palette.panelSoft,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: palette.border),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    state.activeVoiceTitle,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                ),
                                VoiceControlStrip(state: state),
                              ],
                            ),
                          ),
                        ),
                      ],
                      const SectionLabel('Notifications'),
                      SwitchListTile(
                        value: state.notificationsEnabled,
                        onChanged: state.setNotificationsEnabled,
                        secondary: const Icon(
                          Icons.notifications_active_rounded,
                        ),
                        title: const Text('Client notifications'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfileSettingsPanel extends StatefulWidget {
  const _ProfileSettingsPanel({required this.state});

  final WebCordState state;

  @override
  State<_ProfileSettingsPanel> createState() => _ProfileSettingsPanelState();
}

class _ProfileSettingsPanelState extends State<_ProfileSettingsPanel> {
  final _displayName = TextEditingController();
  final _bio = TextEditingController();
  final _status = TextEditingController();
  final _favoriteTrack = TextEditingController();
  final _accent = TextEditingController();

  int? _syncedUserId;
  String? _syncedSignature;
  String? _avatarUrl;
  String? _bannerUrl;

  static const _accentOptions = [
    '#7c5cff',
    '#31e4d1',
    '#4f8cff',
    '#ff6b8a',
    '#f2b84b',
    '#63d471',
  ];

  @override
  void initState() {
    super.initState();
    _syncFromUser(force: true);
  }

  @override
  void didUpdateWidget(covariant _ProfileSettingsPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncFromUser();
  }

  @override
  void dispose() {
    _displayName.dispose();
    _bio.dispose();
    _status.dispose();
    _favoriteTrack.dispose();
    _accent.dispose();
    super.dispose();
  }

  void _syncFromUser({bool force = false}) {
    final user = widget.state.user;
    if (user == null) return;
    final signature =
        '${user.displayName}|${user.bio}|${user.statusText}|'
        '${user.favoriteTrack}|${user.accentColor}|'
        '${user.avatarUrl}|${user.bannerUrl}|'
        '${user.favoriteTrackUrl}|${user.favoriteTrackName}';
    final changed =
        force || _syncedUserId != user.id || _syncedSignature != signature;
    if (!changed) return;

    _syncedUserId = user.id;
    _syncedSignature = signature;
    _avatarUrl = user.avatarUrl;
    _bannerUrl = user.bannerUrl;
    _displayName.text = user.displayName ?? '';
    _bio.text = user.bio;
    _status.text = user.statusText;
    _favoriteTrack.text = user.favoriteTrack;
    _accent.text = _normalizeHexColor(user.accentColor);
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final user = state.user;
    if (user == null) return const SizedBox.shrink();

    final palette = WebCordPalette.of(context);
    final accentColor = _parseHexColor(_accent.text, palette.accent);
    final busy = state.profileSaving || state.profileAssetUploading;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.panelSoft,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                height: 136,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            accentColor.withAlpha(210),
                            palette.panelStrong,
                          ],
                        ),
                        image: _bannerUrl == null
                            ? null
                            : DecorationImage(
                                image: NetworkImage(
                                  _resolveMediaUrl(_bannerUrl!),
                                ),
                                fit: BoxFit.cover,
                              ),
                      ),
                    ),
                    Container(color: Colors.black.withAlpha(55)),
                    Positioned(
                      right: 10,
                      top: 10,
                      child: OutlinedButton.icon(
                        onPressed: busy
                            ? null
                            : () => state.uploadProfileAsset(
                                ProfileAssetKind.banner,
                              ),
                        icon: const Icon(Icons.wallpaper_rounded, size: 18),
                        label: const Text('Banner'),
                      ),
                    ),
                    Positioned(
                      left: 14,
                      bottom: 12,
                      right: 14,
                      child: Row(
                        children: [
                          DecoratedBox(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: accentColor, width: 3),
                            ),
                            child: UserAvatar(user: user, size: 64),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  _displayName.text.trim().isEmpty
                                      ? user.username
                                      : _displayName.text.trim(),
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 18,
                                  ),
                                ),
                                Text(
                                  _status.text.trim().isEmpty
                                      ? 'Online'
                                      : _status.text.trim(),
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton.filledTonal(
                            tooltip: 'Avatar',
                            onPressed: busy
                                ? null
                                : () => state.uploadProfileAsset(
                                    ProfileAssetKind.avatar,
                                  ),
                            icon: const Icon(Icons.add_a_photo_rounded),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, constraints) {
                final stacked = constraints.maxWidth < 560;
                final nameField = TextField(
                  controller: _displayName,
                  maxLength: 40,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(labelText: 'Display name'),
                );
                final statusField = TextField(
                  controller: _status,
                  maxLength: 80,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(labelText: 'Status'),
                );
                if (stacked) {
                  return Column(
                    children: [
                      nameField,
                      const SizedBox(height: 8),
                      statusField,
                    ],
                  );
                }
                return Row(
                  children: [
                    Expanded(child: nameField),
                    const SizedBox(width: 10),
                    Expanded(child: statusField),
                  ],
                );
              },
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _favoriteTrack,
              maxLength: 120,
              decoration: const InputDecoration(
                labelText: 'Track title',
                prefixIcon: Icon(Icons.music_note_rounded),
              ),
            ),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: busy ? null : state.uploadFavoriteTrack,
                    icon: const Icon(Icons.library_music_rounded, size: 18),
                    label: Text(
                      user.favoriteTrackUrl == null
                          ? 'Attach track'
                          : 'Replace track',
                    ),
                  ),
                ),
                if (user.favoriteTrackUrl != null) ...[
                  const SizedBox(width: 8),
                  Icon(Icons.check_circle_rounded, color: palette.cyan),
                ],
              ],
            ),
            if (user.favoriteTrackUrl != null) ...[
              const SizedBox(height: 8),
              ProfileTrackPlayer(
                url: _resolveMediaUrl(user.favoriteTrackUrl!),
                title: _favoriteTrack.text.trim().isEmpty
                    ? user.favoriteTrackName ?? 'Profile track'
                    : _favoriteTrack.text.trim(),
              ),
            ],
            const SizedBox(height: 8),
            TextField(
              controller: _bio,
              minLines: 3,
              maxLines: 5,
              maxLength: 280,
              decoration: const InputDecoration(labelText: 'Bio'),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                for (final color in _accentOptions)
                  Tooltip(
                    message: color,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(999),
                      onTap: () => setState(() => _accent.text = color),
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _parseHexColor(color, palette.accent),
                          border: Border.all(
                            color: _normalizeHexColor(_accent.text) == color
                                ? Colors.white
                                : Colors.white.withAlpha(60),
                            width: 2,
                          ),
                        ),
                      ),
                    ),
                  ),
                SizedBox(
                  width: 120,
                  child: TextField(
                    controller: _accent,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(labelText: 'Accent'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                if (state.profileAssetUploading)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                if (state.profileAssetUploading) const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    user.username,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.muted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                FilledButton.icon(
                  onPressed: busy
                      ? null
                      : () => state.saveProfile(
                          displayName: _displayName.text,
                          bio: _bio.text,
                          statusText: _status.text,
                          favoriteTrack: _favoriteTrack.text,
                          accentColor: _accent.text,
                          avatarUrl: _avatarUrl,
                          bannerUrl: _bannerUrl,
                        ),
                  icon: state.profileSaving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_rounded, size: 18),
                  label: const Text('Save'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _WallpaperSettingsPanel extends StatelessWidget {
  const _WallpaperSettingsPanel({required this.state});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final hasWallpaper = state.chatWallpaperPath.trim().isNotEmpty;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.panelSoft,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: palette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.wallpaper_rounded, color: palette.cyan),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Chat wallpapers',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                if (hasWallpaper)
                  Icon(Icons.check_circle_rounded, color: palette.cyan),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              hasWallpaper
                  ? state.chatWallpaperPath
                  : 'No wallpaper selected for the current chat.',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: palette.muted, fontSize: 12),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.tonalIcon(
                  onPressed: state.setCurrentChatWallpaper,
                  icon: const Icon(Icons.chat_bubble_rounded, size: 18),
                  label: const Text('Current chat'),
                ),
                OutlinedButton.icon(
                  onPressed: state.setGlobalChatWallpaper,
                  icon: const Icon(Icons.public_rounded, size: 18),
                  label: const Text('Global'),
                ),
                TextButton.icon(
                  onPressed: state.clearCurrentChatWallpaper,
                  icon: const Icon(Icons.cleaning_services_rounded, size: 18),
                  label: const Text('Clear chat'),
                ),
                TextButton.icon(
                  onPressed: state.clearGlobalChatWallpaper,
                  icon: const Icon(Icons.layers_clear_rounded, size: 18),
                  label: const Text('Clear global'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.dark_mode_rounded, size: 18),
                const SizedBox(width: 10),
                const SizedBox(
                  width: 86,
                  child: Text(
                    'Dim',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                Expanded(
                  child: Slider(
                    value: state.chatWallpaperDim.toDouble(),
                    min: 0,
                    max: 90,
                    divisions: 18,
                    onChanged: state.setChatWallpaperDim,
                  ),
                ),
                SizedBox(
                  width: 44,
                  child: Text(
                    '${state.chatWallpaperDim}%',
                    textAlign: TextAlign.right,
                    style: TextStyle(color: palette.muted),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _VoiceAudioProfileSelector extends StatelessWidget {
  const _VoiceAudioProfileSelector({required this.state});

  final WebCordState state;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.panelSoft.withAlpha(220),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: palette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.tune_rounded, color: palette.cyan),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Voice profile',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
                Text(
                  '${state.voiceAudioProfile.opusBitrate ~/ 1000} kbps',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SegmentedButton<VoiceAudioProfile>(
                segments: [
                  for (final profile in VoiceAudioProfile.values)
                    ButtonSegment(
                      value: profile,
                      label: Text(profile.label),
                      icon: Icon(_voiceProfileIcon(profile)),
                    ),
                ],
                selected: {state.voiceAudioProfile},
                onSelectionChanged: (value) =>
                    state.setVoiceAudioProfile(value.first),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              state.voiceAudioProfile.caption,
              style: TextStyle(
                color: palette.muted,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsDeviceDropdown extends StatelessWidget {
  const _SettingsDeviceDropdown({
    required this.icon,
    required this.label,
    required this.value,
    required this.devices,
    required this.defaultLabel,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final String value;
  final List<ClientMediaDevice> devices;
  final String defaultLabel;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    final values = {'', ...devices.map((device) => device.id)};
    final selectedValue = values.contains(value) ? value : '';
    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.panelSoft,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: palette.border),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: palette.cyan, size: 18),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: selectedValue,
              isExpanded: true,
              decoration: const InputDecoration(
                contentPadding: EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 9,
                ),
              ),
              items: [
                DropdownMenuItem(value: '', child: Text(defaultLabel)),
                for (final device in devices)
                  DropdownMenuItem(
                    value: device.id,
                    child: Text(device.label, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (next) => onChanged(next ?? ''),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsSlider extends StatelessWidget {
  const _SettingsSlider({
    required this.icon,
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final int value;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    final palette = WebCordPalette.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: palette.panelSoft,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: palette.border),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
          child: Row(
            children: [
              Icon(icon, color: palette.cyan),
              const SizedBox(width: 10),
              SizedBox(
                width: 108,
                child: Text(
                  label,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Expanded(
                child: Slider(
                  value: value.toDouble(),
                  min: 0,
                  max: 200,
                  divisions: 20,
                  onChanged: onChanged,
                ),
              ),
              SizedBox(
                width: 44,
                child: Text(
                  '$value%',
                  textAlign: TextAlign.right,
                  style: TextStyle(color: palette.muted),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

IconData _themeIcon(AppThemeMode mode) {
  return switch (mode) {
    AppThemeMode.liquid => Icons.blur_circular_rounded,
    AppThemeMode.material => Icons.dashboard_customize_rounded,
    AppThemeMode.nebula => Icons.auto_awesome_rounded,
    AppThemeMode.graphite => Icons.contrast_rounded,
    AppThemeMode.aurora => Icons.blur_on_rounded,
  };
}

class _ThemeChoiceCard extends StatelessWidget {
  const _ThemeChoiceCard({
    required this.mode,
    required this.selected,
    required this.onTap,
  });

  final AppThemeMode mode;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final preview = palettes[mode]!;
    return Semantics(
      selected: selected,
      button: true,
      label: '${mode.label} theme',
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: AnimatedScale(
          scale: selected ? 1.025 : 1,
          duration: wcFastMotion,
          curve: wcEase,
          child: AnimatedContainer(
            width: 154,
            height: 92,
            duration: wcBaseMotion,
            curve: wcEase,
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [preview.panelStrong, preview.bgAlt],
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: selected ? preview.accent : preview.border,
                width: selected ? 1.6 : 1,
              ),
              boxShadow: selected
                  ? [
                      BoxShadow(
                        color: preview.accent.withAlpha(48),
                        blurRadius: 22,
                        offset: const Offset(0, 10),
                      ),
                    ]
                  : const [],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(_themeIcon(mode), size: 18, color: preview.accent),
                    const Spacer(),
                    AnimatedSwitcher(
                      duration: wcFastMotion,
                      child: selected
                          ? Icon(
                              Icons.check_circle_rounded,
                              key: const ValueKey('selected'),
                              size: 18,
                              color: preview.accentHot,
                            )
                          : const SizedBox(
                              key: ValueKey('unselected'),
                              width: 18,
                              height: 18,
                            ),
                    ),
                  ],
                ),
                const Spacer(),
                Text(
                  mode.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: preview.text,
                    fontWeight: FontWeight.w900,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 5),
                Row(
                  children: [
                    for (final color in [
                      preview.accent,
                      preview.accentHot,
                      preview.cyan,
                    ])
                      Container(
                        width: 18,
                        height: 5,
                        margin: const EdgeInsets.only(right: 4),
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

IconData _voiceProfileIcon(VoiceAudioProfile profile) {
  return switch (profile) {
    VoiceAudioProfile.voiceFocus => Icons.record_voice_over_rounded,
    VoiceAudioProfile.highFidelity => Icons.high_quality_rounded,
    VoiceAudioProfile.lowData => Icons.network_check_rounded,
  };
}

String _timeLabel(DateTime value) {
  final hour = value.hour.toString().padLeft(2, '0');
  final minute = value.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}

String _durationLabel(Duration value) {
  final minutes = value.inMinutes.remainder(60).toString().padLeft(2, '0');
  final seconds = value.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}

Color _parseHexColor(String value, Color fallback) {
  final normalized = _normalizeHexColor(value);
  final parsed = int.tryParse(normalized.substring(1), radix: 16);
  return parsed == null ? fallback : Color(0xFF000000 | parsed);
}

String _normalizeHexColor(String value) {
  final trimmed = value.trim();
  return RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(trimmed)
      ? trimmed.toLowerCase()
      : '#7c5cff';
}

enum _AttachmentKind { image, video, voice, circleVideo, file }

_AttachmentKind _attachmentKind(ChatMessage message) {
  final type = (message.attachmentType ?? '').toUpperCase();
  final source = _attachmentSource(message);
  final circleType = type == 'CIRCLE_VIDEO';
  final voice = _looksVoiceAttachment(source) || type == 'AUDIO';
  final image =
      type == 'IMAGE' ||
      _hasAttachmentExtension(source, const [
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.bmp',
        '.heic',
        '.heif',
      ]);
  final video =
      circleType ||
      type == 'VIDEO' ||
      _hasAttachmentExtension(source, const [
        '.mp4',
        '.mov',
        '.m4v',
        '.webm',
        '.mkv',
        '.avi',
        '.3gp',
      ]);
  final circle =
      circleType ||
      video &&
          (source.contains('circle-video') ||
              source.contains('round-video') ||
              source.contains('video-note') ||
              source.contains('video_message') ||
              source.contains('video-message') ||
              source.contains('webcord-circle'));

  if (image) return _AttachmentKind.image;
  if (voice) return _AttachmentKind.voice;
  if (circle) return _AttachmentKind.circleVideo;
  if (video) return _AttachmentKind.video;
  return _AttachmentKind.file;
}

IconData _attachmentIcon(ChatMessage message) {
  return switch (_attachmentKind(message)) {
    _AttachmentKind.image => Icons.image_rounded,
    _AttachmentKind.video => Icons.movie_rounded,
    _AttachmentKind.circleVideo => Icons.radio_button_checked_rounded,
    _AttachmentKind.voice => Icons.mic_rounded,
    _AttachmentKind.file => Icons.attach_file_rounded,
  };
}

String _attachmentSource(ChatMessage message) {
  return '${message.attachmentName ?? ''} ${message.attachmentUrl ?? ''}'
      .toLowerCase();
}

bool _looksVoiceAttachment(String source) {
  return source.contains('voice-message') ||
      source.contains('webcord-voice') ||
      source.contains('audio-message') ||
      _hasAttachmentExtension(source, const [
        '.m4a',
        '.aac',
        '.wav',
        '.opus',
        '.ogg',
        '.oga',
        '.mp3',
        '.flac',
      ]);
}

bool _hasAttachmentExtension(String source, List<String> extensions) {
  final tokens = source
      .split(RegExp(r'\s+'))
      .where((token) => token.isNotEmpty);
  for (final token in tokens) {
    final clean = token.split('?').first.split('#').first;
    if (extensions.any(clean.endsWith)) return true;
  }
  return false;
}

String _fileExtension(String path) {
  final name = path.split(RegExp(r'[\\/]')).last;
  final dot = name.lastIndexOf('.');
  if (dot <= 0 || dot == name.length - 1) return '.mp4';
  final extension = name.substring(dot).toLowerCase();
  return extension.length <= 6 ? extension : '.mp4';
}

String _friendlyCameraError(Object exception) {
  if (exception is CameraException) {
    final details = exception.description ?? exception.code;
    return details.isEmpty ? 'Camera is not available' : details;
  }
  return '$exception';
}
