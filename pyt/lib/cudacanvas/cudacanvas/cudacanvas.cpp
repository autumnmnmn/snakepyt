
#include <GLFW/glfw3.h>
#include <torch/extension.h>
#include <stdexcept>
#include <cuda_gl_interop.h>
#include <iostream>
#include <cstdlib>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>

namespace py = pybind11;

std::mutex global_gl_mutex;

struct Command {
    enum Type {
        FINALIZE
    } type;
    void *data;
};

class CommandQueue {
    private:
        std::queue<Command> queue;
        std::mutex mutex;

    public:
        void enqueue(const Command &command) {
            std::lock_guard<std::mutex> lock(mutex);
            queue.push(command);
        }

        bool front(Command &command) {
            std::lock_guard<std::mutex> lock(mutex);
            if (queue.empty()) {
                return false;
            }
            command = queue.front();
            queue.pop();
            return true;
        }
};

struct Canvas {
    CommandQueue queue;
    std::thread thread;
};


void init() {
    if (!glfwInit()) throw std::runtime_error("glfwInit failed");
}

void windowThread(CommandQueue &queue) {
    // w, h, title, monitor, share
    GLFWwindow *window = glfwCreateWindow(512, 512, "Cuda Canvas", nullptr, nullptr);
    if (window == nullptr) {
        throw std::runtime_error("glfw window creation failed");
    }

    GLuint textureId;
    //cudaGraphicsResource_t cudaResource;

    { std::lock_guard<std::mutex> lock(global_gl_mutex);
        glfwMakeContextCurrent(window);

        glGenTextures(1, &textureId);
        glBindTexture(GL_TEXTURE_2D, textureId);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, 512, 512, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);

        GLenum glError = glGetError();
        if (glError != GL_NO_ERROR) {
            throw std::runtime_error("OpenGL error before texture registration"); // TODO include the error lol
        }

        glClearColor(0.8f, 0.3f, 1.0f, 1.0f);
        glClear(GL_COLOR_BUFFER_BIT);

        glfwSwapBuffers(window);
    }

    bool keepOpen = true;
    while (keepOpen) {
        glfwPollEvents();
        // TODO: glfw events

        if (glfwWindowShouldClose(window)) {
            keepOpen = false;
            continue;
        }

        Command command;
        if (queue.front(command)) {
            // TODO: actual cmd processing
            keepOpen = false;
            continue;
        }
    }

    glfwDestroyWindow(window);
}

void *createWindow() {
    Canvas *c = (Canvas*)malloc(sizeof(Canvas));
    if (c == nullptr) {
        throw std::runtime_error("malloc failed");
    }

    new (&(c->queue)) CommandQueue();
    new (&(c->thread)) std::thread(windowThread, std::ref(c->queue));

    return c;
}

// SAFETY: hahaha
void closeWindow(void *ptr) {
    Canvas *c = (Canvas*)ptr;

    c->queue.enqueue({Command::FINALIZE, nullptr});
    c->thread.join();
    c->queue.~CommandQueue();
    c->thread.~thread();
    free(c);
}

PYBIND11_MODULE(cudacanvas_cpp, m)
{
    m.def("init", &init);
    m.def("createWindow", &createWindow);
    m.def("closeWindow", &closeWindow);
}

